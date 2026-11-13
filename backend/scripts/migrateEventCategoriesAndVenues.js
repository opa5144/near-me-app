// Approved native migration: update eventList categories and explicitly mapped
// demo venues only. No app startup, index changes, or writes to related records.
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient, BSON, ObjectId } = require('mongodb');
const {
  backup, snapshot, readSnapshot, metadata, canonical, fingerprint, assertSnapshot,
  BSON_OPTIONS, TRANSACTION_OPTIONS, writePrivate,
} = require('./cleanupLegacySplitFields');

const FIXTURE_FILE = path.resolve(__dirname, 'fixtures/category-demo/venues.json');
const CATEGORIES = Object.freeze(['Music', 'Dance', 'Food', 'Film', 'Workshop', 'Art']);
const VENUE_FIELDS = Object.freeze(['place', 'address', 'placeId', 'latitude', 'longitude', 'timeZone']);
const ALLOWED_FIELDS = Object.freeze(['categories', 'category', ...VENUE_FIELDS]);
const NOTICE_SEED_PREFIX = 'category-demo-2026-11-12:';
const OLD_DEMO_NOTICE = 'The event, venue, and address are illustrative; no real admission, booking, or organizer endorsement is offered.';
const NEW_DEMO_NOTICE = "The venue and address are real, but this event's title, date, program, and price are fictional demo data. No scheduled booking, admission, or venue endorsement is implied.";
// An unseeded original demo needs a separately reviewed hard-coded ID here.
// Editable fixture assignments alone cannot authorize changing manual venues.
const APPROVED_UNSEEDED_DEMO_IDS = Object.freeze([]);
const has = (object, field) => Object.prototype.hasOwnProperty.call(object, field);
const clone = value => BSON.deserialize(BSON.serialize(value), BSON_OPTIONS);
const operation = { stage: 'starting', commitStatus: 'not-started', backupPath: null };

class MigrationError extends Error {
  constructor(message) { super(message); this.name = 'EventCategoriesVenuesMigrationError'; }
}

function loadFixture() {
  let fixture;
  try { fixture = JSON.parse(fs.readFileSync(FIXTURE_FILE, 'utf8')); }
  catch { throw new MigrationError('The approved venue fixture is missing or is not valid JSON.'); }
  if (!fixture || !Array.isArray(fixture.venues) || !Array.isArray(fixture.assignments)) {
    throw new MigrationError('The venue fixture must contain venues and explicit assignments.');
  }
  const venues = new Map();
  // Verification notes stay fixture-only; none are copied into eventList.
  const venueKeys = new Set(['key', ...VENUE_FIELDS, 'sourceUrl', 'category', 'googleName', 'googleAddress', 'verifiedOn']);
  for (const item of fixture.venues) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !venueKeys.has(key)) ||
        typeof item.key !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(item.key) || venues.has(item.key) ||
        (has(item, 'category') && !CATEGORIES.includes(item.category)) ||
        ['googleName', 'googleAddress', 'verifiedOn'].some(field => has(item, field) &&
          (typeof item[field] !== 'string' || !item[field].trim())) ||
        typeof item.place !== 'string' || !item.place.trim() || item.place.trim().length > 300 ||
        typeof item.address !== 'string' || !item.address.trim() || item.address.trim().length > 500 ||
        !has(item, 'placeId') || (item.placeId !== null &&
          (typeof item.placeId !== 'string' || !item.placeId.trim() || item.placeId.length > 500)) ||
        typeof item.latitude !== 'number' || !Number.isFinite(item.latitude) || Math.abs(item.latitude) > 90 ||
        typeof item.longitude !== 'number' || !Number.isFinite(item.longitude) || Math.abs(item.longitude) > 180 ||
        typeof item.timeZone !== 'string' || !item.timeZone.trim()) {
      throw new MigrationError('A venue has invalid or unapproved metadata.');
    }
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: item.timeZone }).format(new Date());
      const source = new URL(item.sourceUrl);
      if (source.protocol !== 'https:' || source.username || source.password) throw new Error('Invalid source.');
    } catch { throw new MigrationError('Venue timezone or verification source is invalid.'); }
    venues.set(item.key, {
      place: item.place.trim(), address: item.address.trim(),
      // Explicit null is permitted only when no real Google place ID was resolved.
      // Source verification remains a human-reviewed fixture, never fabricated IDs.
      placeId: item.placeId === null ? null : item.placeId.trim(),
      latitude: new BSON.Double(item.latitude), longitude: new BSON.Double(item.longitude),
      timeZone: item.timeZone.trim(),
    });
  }
  const selectors = new Set();
  const assignments = fixture.assignments.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).some(key => !['eventId', 'seedKey', 'venueKey', 'replaceDemoNotice'].includes(key)) ||
        has(item, 'eventId') === has(item, 'seedKey') || !venues.has(item.venueKey) ||
        (has(item, 'replaceDemoNotice') && typeof item.replaceDemoNotice !== 'boolean') ||
        (has(item, 'eventId') && (typeof item.eventId !== 'string' || !/^[a-f0-9]{24}$/i.test(item.eventId))) ||
        (has(item, 'seedKey') && (typeof item.seedKey !== 'string' || !item.seedKey || item.seedKey.length > 200))) {
      throw new MigrationError('Each venue assignment needs one valid event selector and one approved venue key.');
    }
    const assignment = has(item, 'eventId')
      ? { eventId: item.eventId.toLowerCase(), venueKey: item.venueKey, replaceDemoNotice: item.replaceDemoNotice === true }
      : { seedKey: item.seedKey, venueKey: item.venueKey, replaceDemoNotice: item.replaceDemoNotice === true };
    const selector = has(assignment, 'eventId') ? 'id:' + assignment.eventId : 'seed:' + assignment.seedKey;
    if (selectors.has(selector)) throw new MigrationError('Venue assignment selectors must be unique.');
    selectors.add(selector);
    return assignment;
  });
  return { venues, assignments };
}

function normalizeCategories(event) {
  if (has(event, 'categories')) {
    if (!Array.isArray(event.categories) || !event.categories.length ||
        event.categories.some(value => typeof value !== 'string' || !CATEGORIES.includes(value.trim()))) {
      throw new MigrationError('An existing categories array is empty or contains unknown values; migration stopped.');
    }
    // Preserve the order and membership of valid existing arrays, removing only
    // harmless duplicate entries/whitespace instead of replacing them with legacy data.
    const categories = [...new Set(event.categories.map(value => value.trim()))];
    if (categories.length > 6) throw new MigrationError('An existing event has too many categories.');
    return categories;
  }
  if (typeof event.category !== 'string' || !CATEGORIES.includes(event.category.trim())) {
    throw new MigrationError('An event has no valid legacy category or categories array; migration stopped.');
  }
  return [event.category.trim()];
}

function assignedVenues(events, fixture) {
  const ids = new Map();
  const seeds = new Map();
  for (const event of events) {
    if (!(event._id instanceof ObjectId)) throw new MigrationError('An event has an unexpected identifier type.');
    ids.set(String(event._id), event);
    if (typeof event.seedKey === 'string' && event.seedKey) {
      if (seeds.has(event.seedKey)) throw new MigrationError('Existing seed keys are ambiguous; migration stopped.');
      seeds.set(event.seedKey, event);
    }
  }
  const result = new Map();
  for (const assignment of fixture.assignments) {
    const event = has(assignment, 'eventId') ? ids.get(assignment.eventId) : seeds.get(assignment.seedKey);
    if (!event) throw new MigrationError('An explicitly assigned demo event is missing; migration stopped.');
    const id = String(event._id);
    if (!(typeof event.seedKey === 'string' && event.seedKey) && !APPROVED_UNSEEDED_DEMO_IDS.includes(id)) {
      throw new MigrationError('A venue assignment targets an unapproved unseeded event; manual venues must remain unchanged.');
    }
    if (result.has(id)) throw new MigrationError('Multiple selectors resolve to the same venue target.');
    if (assignment.replaceDemoNotice && !(typeof event.seedKey === 'string' && event.seedKey.startsWith(NOTICE_SEED_PREFIX))) {
      throw new MigrationError('Demo notice replacement is restricted to the approved category-demo seed prefix.');
    }
    const venue = fixture.venues.get(assignment.venueKey);
    const alreadyDesired = VENUE_FIELDS.every(field => {
      if (field === 'latitude' || field === 'longitude') {
        return event[field] != null && Number(event[field]) === Number(venue[field]);
      }
      return event[field] === venue[field];
    });
    const fictionalAddress = typeof event.address === 'string' &&
      /\b(?:demo|fictional|imaginary|make[- ]believe|example[\s-]*borough)\b/i.test(event.address);
    if (!fictionalAddress && !alreadyDesired) {
      throw new MigrationError('A demo venue was changed to another real address; preserve the edit and review its assignment.');
    }
    result.set(id, { venue, replaceDemoNotice: assignment.replaceDemoNotice });
  }
  return result;
}

function planMigration(data, fixture) {
  const venues = assignedVenues(data.eventList, fixture);
  const expected = { ...data };
  const changes = [];
  const descriptionAllowedIds = new Set([...venues.entries()].filter(([, assignment]) => assignment.replaceDemoNotice).map(([id]) => id));
  const counts = {
    events: data.eventList.length, categoriesChanged: 0, legacyCategoriesRemoved: 0,
    venueAssignments: venues.size, venuesChanged: 0, demoNoticeAssignments: descriptionAllowedIds.size, demoNoticesChanged: 0,
  };
  expected.eventList = data.eventList.map(event => {
    const desired = clone(event);
    desired.categories = normalizeCategories(event);
    delete desired.category;
    const assignment = venues.get(String(event._id));
    if (assignment) for (const field of VENUE_FIELDS) desired[field] = assignment.venue[field];
    if (assignment?.replaceDemoNotice) {
      const description = event.description;
      const oldCount = typeof description === 'string' ? description.split(OLD_DEMO_NOTICE).length - 1 : 0;
      const newCount = typeof description === 'string' ? description.split(NEW_DEMO_NOTICE).length - 1 : 0;
      if (oldCount + newCount !== 1) {
        throw new MigrationError('A flagged demo description has no single approved old or current notice; review before migrating.');
      }
      desired.description = oldCount ? description.replace(OLD_DEMO_NOTICE, NEW_DEMO_NOTICE) : description;
    }
    const set = {};
    for (const field of ['categories', ...VENUE_FIELDS, ...(assignment?.replaceDemoNotice ? ['description'] : [])]) {
      if (has(desired, field) && (!has(event, field) || canonical(event[field]) !== canonical(desired[field]))) {
        set[field] = desired[field];
      }
    }
    const unset = has(event, 'category') ? { category: '' } : {};
    if (has(set, 'categories')) counts.categoriesChanged++;
    if (has(event, 'category')) counts.legacyCategoriesRemoved++;
    if (VENUE_FIELDS.some(field => has(set, field))) counts.venuesChanged++;
    if (has(set, 'description')) counts.demoNoticesChanged++;
    if (Object.keys(set).length || Object.keys(unset).length) {
      changes.push({ id: event._id, set, unset, allowDescription: assignment?.replaceDemoNotice === true });
    }
    return desired;
  });
  counts.eventsToUpdate = changes.length;
  return { expected, changes, counts, descriptionAllowedIds };
}

function protectedEventFingerprint(events, descriptionAllowedIds) {
  return fingerprint(events.map(event => {
    const unchanged = { ...event };
    for (const field of ALLOWED_FIELDS) delete unchanged[field];
    if (descriptionAllowedIds.has(String(event._id))) delete unchanged.description;
    return unchanged;
  }));
}

function collectionChecks(actual, expected, before, names, actualMetadata, beforeMetadata, descriptionAllowedIds) {
  return Object.fromEntries(names.map(name => [name, {
    beforeCount: before[name].length, afterCount: actual[name].length,
    onlyExpectedChanges: name === 'eventList'
      ? canonical(actual[name]) === canonical(expected[name]) &&
        protectedEventFingerprint(actual[name], descriptionAllowedIds) === protectedEventFingerprint(before[name], descriptionAllowedIds)
      : fingerprint(actual[name]) === fingerprint(before[name]),
    metadataUnchanged: canonical(actualMetadata[name]) === canonical(beforeMetadata[name]),
  }]));
}

function assertTransformed(actual, expected, before, names, descriptionAllowedIds = new Set()) {
  for (const name of names) {
    const valid = name === 'eventList'
      ? canonical(actual[name]) === canonical(expected[name]) &&
        protectedEventFingerprint(actual[name], descriptionAllowedIds) === protectedEventFingerprint(before[name], descriptionAllowedIds)
      : fingerprint(actual[name]) === fingerprint(before[name]);
    if (!valid) throw new MigrationError('A collection differs from the exact approved transformation; transaction aborted.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !['--plan', '--apply'].includes(arg))) {
    throw new MigrationError('Use --plan (read only) or --apply (private backup and approved event updates).');
  }
  const apply = args[0] === '--apply';
  const fixture = loadFixture();
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  if (!process.env.MONGO_URI) throw new MigrationError('MONGO_URI is not configured.');
  const client = new MongoClient(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 12000, connectTimeoutMS: 10000, maxPoolSize: 3,
  });
  const deadline = setTimeout(() => {
    console.error(JSON.stringify({ error: 'ConnectionTimeout', ...operation })); process.exit(1);
  }, 35000);
  try {
    await client.connect(); clearTimeout(deadline);
    operation.stage = 'preflight';
    const db = client.db();
    const beforeMetadata = await metadata(db);
    const names = Object.keys(beforeMetadata);
    const before = await readSnapshot(client, db, names);
    const plan = planMigration(before, fixture);
    const summary = { mode: apply ? 'apply' : 'plan', ...plan.counts, existingCollectionCount: names.length };
    if (!apply) { console.log(JSON.stringify(summary, null, 2)); return; }

    operation.stage = 'backup';
    operation.backupPath = backup(before, beforeMetadata, db.databaseName, 'event-categories-venues');
    console.log(JSON.stringify({ stage: 'backup-complete', backupPath: operation.backupPath }));
    if (canonical(await metadata(db)) !== canonical(beforeMetadata)) {
      throw new MigrationError('Database metadata changed after backup; take a fresh snapshot before applying.');
    }
    const session = client.startSession();
    try {
      operation.stage = 'transaction'; operation.commitStatus = 'not-confirmed';
      await session.withTransaction(async () => {
        const current = await snapshot(db, names, session);
        assertSnapshot(current, before, names);
        // Re-resolve selectors against the exact transaction preimages.
        const currentPlan = planMigration(current, fixture);
        if (canonical(currentPlan.expected.eventList) !== canonical(plan.expected.eventList)) {
          throw new MigrationError('The approved event transformation changed after backup.');
        }
        for (const change of currentPlan.changes) {
          if (Object.keys(change.set).some(field => !ALLOWED_FIELDS.includes(field) && !(field === 'description' && change.allowDescription)) ||
              Object.keys(change.unset).some(field => field !== 'category')) {
            throw new MigrationError('A write exceeded the approved event field allowlist.');
          }
          const update = {
            ...(Object.keys(change.set).length ? { $set: change.set } : {}),
            ...(Object.keys(change.unset).length ? { $unset: change.unset } : {}),
          };
          // Native updates deliberately preserve updatedAt, IDs, hosts and all
          // related collections. No Mongoose hooks or full-document replacements.
          const result = await db.collection('eventList').updateOne({ _id: change.id }, update, { session });
          if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
            throw new MigrationError('Event update counts differ from the approved transformation.');
          }
        }
        assertTransformed(await snapshot(db, names, session), plan.expected, before, names, plan.descriptionAllowedIds);
        assertSnapshot(await readSnapshot(client, db, names), before, names);
        if (canonical(await metadata(db)) !== canonical(beforeMetadata)) {
          throw new MigrationError('Database metadata changed during migration; transaction aborted.');
        }
      }, TRANSACTION_OPTIONS);
      operation.commitStatus = 'confirmed';
    } finally { await session.endSession(); }

    operation.stage = 'verification';
    const after = await readSnapshot(client, db, names);
    const afterMetadata = await metadata(db);
    const checks = collectionChecks(after, plan.expected, before, names, afterMetadata, beforeMetadata, plan.descriptionAllowedIds);
    const report = {
      ...summary, completedAt: new Date().toISOString(), backupPath: operation.backupPath,
      commitStatus: operation.commitStatus, collectionChecks: checks,
      collectionSetUnchanged: canonical(Object.keys(afterMetadata)) === canonical(names),
      categoryArraysValid: after.eventList.every(event => !has(event, 'category') &&
        Array.isArray(event.categories) && event.categories.length >= 1 && event.categories.length <= 6 &&
        new Set(event.categories).size === event.categories.length && event.categories.every(category => CATEGORIES.includes(category))),
    };
    report.integrityVerified = report.collectionSetUnchanged && report.categoryArraysValid &&
      Object.values(checks).every(check => check.onlyExpectedChanges && check.metadataUnchanged);
    writePrivate(path.join(operation.backupPath, 'event-categories-venues-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.integrityVerified) {
      throw new MigrationError('Migration committed, but concurrent changes or a verification difference require review before another apply.');
    }
    operation.stage = 'complete';
  } finally { clearTimeout(deadline); await client.close(); }
}

module.exports = { loadFixture, normalizeCategories, planMigration, assertTransformed };

if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({
    error: error.name, code: error.code ?? null, ...operation,
    message: error instanceof MigrationError ? error.message : 'Migration stopped; connection details and document values are omitted.',
  }));
  process.exitCode = 1;
});

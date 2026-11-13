// Approved, additive demo import. Native writes are restricted to eventList/EventPhotos.
// Run manually with --plan or --apply; importing this module never connects to MongoDB.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { MongoClient, BSON, ObjectId } = require('mongodb');
const Event = require('../src/models/Event');
const EventPhoto = require('../src/models/EventPhoto');
const { parseCreateEvent } = require('../src/services/eventData');
const {
  backup, snapshot, readSnapshot, metadata, canonical, fingerprint, assertSnapshot,
  BSON_OPTIONS, TRANSACTION_OPTIONS, writePrivate,
} = require('./cleanupLegacySplitFields');

const FIXTURE_DIRECTORY = path.resolve(__dirname, 'fixtures/category-demo');
const SEED_PREFIX = 'category-demo-2026-11-12';
const OWNERS = Object.freeze([
  '6ae7814e7d5f88664b48dc90', '6ae7ad81d75d3755e55f82d3', '6aeb4f6c9b286ace01de1aea',
]);
const CATEGORIES = Object.freeze(['Music', 'Dance', 'Food', 'Film', 'Workshop', 'Art']);
const MAX_IMAGE_BYTES = 1024 * 1024;
const INSERT_COLLECTIONS = Object.freeze(['eventList', 'EventPhotos']);
const EVENT_FIELDS = new Set([
  'seedKey', 'hostId', 'title', 'categories', 'category', 'description', 'price', 'startsAt', 'endsAt',
  'timeZone', 'address', 'place', 'placeId', 'latitude', 'longitude', 'photoIds',
]);
const operation = { stage: 'starting', commitStatus: 'not-started', backupPath: null };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => BSON.deserialize(BSON.serialize(value), BSON_OPTIONS);

class ImportError extends Error {
  constructor(message) { super(message); this.name = 'CategoryEventsImportError'; }
}

function readJson(filename) {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch { throw new ImportError('A required local fixture is missing or is not valid JSON.'); }
}

function stableId(kind, key) {
  return new ObjectId(hash(Buffer.from(SEED_PREFIX + ':' + kind + ':' + key, 'utf8')).slice(0, 24));
}

function verifyJpeg(bytes) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || bytes.length < 4 ||
      bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new ImportError('A fixture photo is not a bounded JPEG image.');
  }
}

function fixtureCategories(item) {
  // Legacy fixture input is accepted, but new database records contain only
  // categories. The first category retains stable seed and source-photo grouping.
  const categories = Object.prototype.hasOwnProperty.call(item, 'categories') ? item.categories : [item.category];
  if (!Array.isArray(categories) || categories.length < 1 || categories.length > 6 ||
      new Set(categories).size !== categories.length || categories.some(category => !CATEGORIES.includes(category)) ||
      (item.category !== undefined && item.category !== categories[0])) {
    throw new ImportError('An event must contain one to six distinct approved categories.');
  }
  return categories;
}

async function validateDocument(Model, value) {
  const document = new Model(value);
  try { await document.validate(); }
  catch { throw new ImportError('A prepared event or photo failed disconnected schema validation.'); }
  // Round-trip the exact insert payload so expected fingerprints retain BSON
  // numeric/binary types when the native driver reads the inserted records back.
  const plain = document.toObject({ depopulate: true, versionKey: true });
  // MongoDB stores _id first, so expected BSON must use that same field order.
  return clone({ _id: plain._id, ...plain });
}

async function prepareFixtures() {
  const fixture = readJson(path.join(FIXTURE_DIRECTORY, 'events.json'));
  const media = readJson(path.join(FIXTURE_DIRECTORY, 'photos.json'));
  if (!fixture || fixture.seedPrefix !== SEED_PREFIX || !Array.isArray(fixture.owners) ||
      canonical([...fixture.owners].sort()) !== canonical([...OWNERS].sort()) ||
      !Array.isArray(fixture.events) || fixture.events.length !== 60) {
    throw new ImportError('Fixtures must contain the approved prefix, three owners, and sixty events.');
  }
  if (!media || media.licenseUrl !== 'https://www.pexels.com/license/' || !Array.isArray(media.photos) || media.photos.length !== 30) {
    throw new ImportError('Fixtures must identify the approved license and thirty source photographs.');
  }
  const photoAssets = new Map();
  const assetCounts = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
  const fixtureRoot = fs.realpathSync(FIXTURE_DIRECTORY);
  for (const item of media.photos) {
    if (!item || typeof item.id !== 'string' || !/^\d+$/.test(item.id) || photoAssets.has(item.id) ||
        !CATEGORIES.includes(item.category) || item.file !== 'photos/pexels-' + item.id + '.jpg' ||
        typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) ||
        typeof item.description !== 'string' || !item.description.trim()) {
      throw new ImportError('Photo metadata has an invalid ID, category, path, checksum, or description.');
    }
    let source;
    let download;
    try { source = new URL(item.sourcePage); download = new URL(item.downloadUrl); }
    catch { throw new ImportError('Photo attribution must contain valid source and download URLs.'); }
    if (source.protocol !== 'https:' || source.hostname !== 'www.pexels.com' ||
        download.protocol !== 'https:' || download.hostname !== 'images.pexels.com') {
      throw new ImportError('Photo attribution is outside the approved source.');
    }
    let bytes;
    try {
      const filename = fs.realpathSync(path.resolve(FIXTURE_DIRECTORY, item.file));
      if (!filename.startsWith(fixtureRoot + path.sep) || !fs.statSync(filename).isFile()) {
        throw new ImportError('A fixture photo is outside the approved local directory.');
      }
      bytes = fs.readFileSync(filename);
    } catch (error) {
      if (error instanceof ImportError) throw error;
      throw new ImportError('A required local fixture photo is unavailable.');
    }
    verifyJpeg(bytes);
    if (hash(bytes) !== item.sha256) throw new ImportError('A fixture photo does not match its recorded checksum.');
    photoAssets.set(item.id, { category: item.category, bytes });
    assetCounts[item.category]++;
  }
  if (Object.values(assetCounts).some(count => count !== 5)) {
    throw new ImportError('Each approved category must have five source photographs.');
  }

  const ownerCounts = new Map(OWNERS.map(id => [id, 0]));
  const categoryCounts = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
  const seedKeys = new Set();
  const eventIds = new Set();
  const photoIds = new Set();
  const entries = [];
  const now = new Date();
  for (const item of fixture.events) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ImportError('An event fixture must be an object.');
    const categories = fixtureCategories(item);
    const primaryCategory = categories[0];
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).some(key => !EVENT_FIELDS.has(key)) || !OWNERS.includes(item.hostId) ||
        typeof item.seedKey !== 'string' ||
        !new RegExp('^' + SEED_PREFIX + ':' + primaryCategory.toLowerCase() + ':(?:0[1-9]|10)$').test(item.seedKey) ||
        seedKeys.has(item.seedKey) || !Array.isArray(item.photoIds) || item.photoIds.length !== 2 ||
        new Set(item.photoIds).size !== 2) {
      throw new ImportError('An event has an unapproved field, owner, category, seed key, or photo count.');
    }
    let parsed;
    const input = { ...item, categories };
    delete input.category;
    try { parsed = parseCreateEvent(input); }
    catch { throw new ImportError('An event fixture failed current event-input validation.'); }
    const eventId = stableId('event', item.seedKey);
    if (eventIds.has(String(eventId))) throw new ImportError('Prepared event IDs collide.');
    const event = await validateDocument(Event, {
      _id: eventId, hostId: new ObjectId(item.hostId), ...parsed, seedKey: item.seedKey,
      createdAt: now, updatedAt: now, __v: 0,
    });
    if (!Array.isArray(event.categories) || canonical(event.categories) !== canonical(categories) ||
        ['category', 'photos', 'imageData', 'imageMimeType'].some(field => Object.prototype.hasOwnProperty.call(event, field))) {
      throw new ImportError('Prepared event metadata must contain categories and no legacy fields.');
    }
    const photos = [];
    for (let order = 0; order < item.photoIds.length; order++) {
      const asset = photoAssets.get(item.photoIds[order]);
      if (!asset || asset.category !== primaryCategory) {
        throw new ImportError('Each event must reference two photographs from its primary category.');
      }
      const photoId = stableId('photo', String(eventId) + ':' + order);
      if (photoIds.has(String(photoId))) throw new ImportError('Prepared photo IDs collide.');
      photos.push(await validateDocument(EventPhoto, {
        _id: photoId, eventId, imageData: asset.bytes, imageMimeType: 'image/jpeg', displayOrder: order,
        createdAt: now, updatedAt: now, __v: 0,
      }));
      photoIds.add(String(photoId));
    }
    seedKeys.add(item.seedKey);
    eventIds.add(String(eventId));
    ownerCounts.set(item.hostId, ownerCounts.get(item.hostId) + 1);
    categoryCounts[primaryCategory]++;
    entries.push({ event, photos });
  }
  if (Object.values(categoryCounts).some(count => count !== 10) || [...ownerCounts.values()].some(count => count !== 20)) {
    throw new ImportError('The approved batch needs ten events per primary category and twenty per owner.');
  }
  return { entries, categoryCounts, sourcePhotos: photoAssets.size };
}

function verifyOwners(data) {
  const accounts = new Map(data.AccountList.map(account => [String(account._id), account]));
  for (const id of OWNERS) {
    const account = accounts.get(id);
    if (!account || !(account._id instanceof ObjectId) || account.deletedAt != null) {
      throw new ImportError('An approved owner is missing or inactive; no import may proceed.');
    }
  }
}

function verifyIndexes(collectionMetadata) {
  for (const [name, key] of [
    ['eventList', { seedKey: 1 }], ['EventPhotos', { eventId: 1, displayOrder: 1 }],
  ]) {
    if (!collectionMetadata[name]?.indexes.some(index => index.unique === true && canonical(index.key) === canonical(key))) {
      throw new ImportError('A required existing unique index is missing; this importer never changes indexes.');
    }
  }
}

function planImport(data, prepared) {
  verifyOwners(data);
  const existingEvents = new Map(data.eventList.map(event => [String(event._id), event]));
  const existingPhotos = new Set(data.EventPhotos.map(photo => String(photo._id)));
  const existingPhotoParents = new Set(data.EventPhotos.map(photo => String(photo.eventId)));
  const seeds = new Map();
  for (const event of data.eventList) {
    if (typeof event.seedKey !== 'string') continue;
    if (seeds.has(event.seedKey)) throw new ImportError('Existing event seed keys are duplicated; import stopped.');
    seeds.set(event.seedKey, event);
  }
  const events = [];
  const photos = [];
  let skipped = 0;
  for (const entry of prepared.entries) {
    const id = String(entry.event._id);
    const occupyingEvent = existingEvents.get(id);
    if (occupyingEvent && occupyingEvent.seedKey !== entry.event.seedKey) {
      throw new ImportError('A deterministic event ID belongs to an existing different record.');
    }
    // An existing seed is authoritative even after its owner edits or removes
    // photos. Reruns never repair it or re-create its original demonstration data.
    if (seeds.has(entry.event.seedKey)) { skipped++; continue; }
    if (occupyingEvent || existingPhotoParents.has(id) || entry.photos.some(photo => existingPhotos.has(String(photo._id)))) {
      throw new ImportError('A new event or photo collides with existing records.');
    }
    events.push(entry.event);
    photos.push(...entry.photos);
  }
  return { events, photos, skipped };
}

function insertCollection(db, name) {
  if (!INSERT_COLLECTIONS.includes(name)) throw new ImportError('A database write targeted an unapproved collection.');
  return db.collection(name);
}

function expectedState(before, additions, names) {
  const expected = { ...before };
  for (const [name, rows] of [['eventList', additions.events], ['EventPhotos', additions.photos]]) {
    // Every _id in these collections is an ObjectId; hexadecimal order is BSON's
    // byte order. Other collection arrays retain their native snapshot ordering.
    if (before[name].some(document => !(document._id instanceof ObjectId))) {
      throw new ImportError('An insert collection contains an unexpected identifier type.');
    }
    expected[name] = [...before[name], ...rows].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  }
  if (names.some(name => !expected[name])) throw new ImportError('The database snapshot is incomplete.');
  return expected;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !['--plan', '--apply'].includes(arg))) {
    throw new ImportError('Use --plan (read only) or --apply (private backup and additive import).');
  }
  const apply = args[0] === '--apply';
  operation.stage = 'fixture-validation';
  const prepared = await prepareFixtures();
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  if (!process.env.MONGO_URI) throw new ImportError('MONGO_URI is not configured.');
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
    verifyIndexes(beforeMetadata);
    const names = Object.keys(beforeMetadata);
    const before = await readSnapshot(client, db, names);
    const additions = planImport(before, prepared);
    const expected = expectedState(before, additions, names);
    const summary = {
      mode: apply ? 'apply' : 'plan', approvedOwners: OWNERS.length,
      fixtureEvents: prepared.entries.length, categoryCounts: prepared.categoryCounts,
      sourcePhotos: prepared.sourcePhotos, skippedExistingEvents: additions.skipped,
      eventsToInsert: additions.events.length, photosToInsert: additions.photos.length,
      existingCollectionCount: names.length,
    };
    if (!apply) { console.log(JSON.stringify(summary, null, 2)); return; }

    operation.stage = 'backup';
    operation.backupPath = backup(before, beforeMetadata, db.databaseName, 'category-events-import');
    console.log(JSON.stringify({ stage: 'backup-complete', backupPath: operation.backupPath }));
    if (canonical(await metadata(db)) !== canonical(beforeMetadata)) {
      throw new ImportError('Database metadata changed after backup; take a fresh backup before importing.');
    }
    const session = client.startSession();
    try {
      operation.stage = 'transaction';
      operation.commitStatus = 'not-confirmed';
      await session.withTransaction(async () => {
        const current = await snapshot(db, names, session);
        assertSnapshot(current, before, names);
        verifyOwners(current);
        const currentPlan = planImport(current, prepared);
        if (fingerprint(currentPlan.events) !== fingerprint(additions.events) ||
            fingerprint(currentPlan.photos) !== fingerprint(additions.photos)) {
          throw new ImportError('The additive import plan changed after backup.');
        }
        for (const [name, documents] of [['eventList', additions.events], ['EventPhotos', additions.photos]]) {
          if (!documents.length) continue;
          const result = await insertCollection(db, name).insertMany(documents, { session, ordered: true });
          if (result.insertedCount !== documents.length) throw new ImportError('Insert counts differ from the approved additive plan.');
        }
        assertSnapshot(await snapshot(db, names, session), expected, names);
        // An independent read sees pre-commit data and catches outside writes
        // hidden by the transaction snapshot. Owner identities remain untouched.
        const latest = await readSnapshot(client, db, names);
        assertSnapshot(latest, before, names);
        verifyOwners(latest);
        if (canonical(await metadata(db)) !== canonical(beforeMetadata)) {
          throw new ImportError('Database metadata changed during the import; transaction aborted.');
        }
      }, TRANSACTION_OPTIONS);
      operation.commitStatus = 'confirmed';
    } finally { await session.endSession(); }

    operation.stage = 'verification';
    const after = await readSnapshot(client, db, names);
    const afterMetadata = await metadata(db);
    const collectionChecks = Object.fromEntries(names.map(name => [name, {
      beforeCount: before[name].length, afterCount: after[name].length,
      onlyExpectedAdditions: fingerprint(after[name]) === fingerprint(expected[name]),
      metadataUnchanged: canonical(beforeMetadata[name]) === canonical(afterMetadata[name]),
    }]));
    const report = {
      ...summary, completedAt: new Date().toISOString(), backupPath: operation.backupPath,
      commitStatus: operation.commitStatus,
      inserted: { events: additions.events.length, photos: additions.photos.length },
      collectionSetUnchanged: canonical(Object.keys(afterMetadata)) === canonical(names),
      collectionChecks,
    };
    report.integrityVerified = report.collectionSetUnchanged &&
      Object.values(collectionChecks).every(check => check.onlyExpectedAdditions && check.metadataUnchanged);
    writePrivate(path.join(operation.backupPath, 'category-events-import-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (!report.integrityVerified) {
      throw new ImportError('Import committed, but concurrent changes or a verification difference require review before another import.');
    }
    operation.stage = 'complete';
  } finally { clearTimeout(deadline); await client.close(); }
}

module.exports = { prepareFixtures, planImport, expectedState };

if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({
    error: error.name, code: error.code ?? null, ...operation,
    message: error instanceof ImportError ? error.message : 'Import stopped; connection details and document values are omitted.',
  }));
  process.exitCode = 1;
});

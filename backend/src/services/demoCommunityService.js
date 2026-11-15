const { createHash, randomBytes } = require('node:crypto');
const argon2 = require('argon2');
const mongoose = require('mongoose');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const AccountSecurity = require('../models/AccountSecurity');
const Event = require('../models/Event');
const EventPhoto = require('../models/EventPhoto');
const EventSelection = require('../models/EventSelection');
const EventRating = require('../models/EventRating');
const NotificationJob = require('../models/NotificationJob');
const { EVENT_CATEGORIES } = require('../constants/eventCategories');
const { scheduleSelectionNotifications } = require('./notifications/triggerService');
const { writeEventSelection } = require('./eventSelectionService');

const DAY = 86400000;
const HOUR = 3600000;
const PREFIX = 'demo-community-v1';
const DEMO_COUNT = 50;
const COMPLETED_MINIMUM = 5;
const FIRST_NAMES = ['Avery', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Cameron', 'Quinn', 'Reese', 'Parker',
  'Alex', 'Jamie', 'Skyler', 'Rowan', 'Finley', 'Sage', 'Dakota', 'Emerson', 'Harper', 'Remy',
  'Sam', 'Drew', 'Robin', 'Charlie', 'Elliot', 'River', 'Phoenix', 'Blair', 'Adrian', 'Lane',
  'Jules', 'Marley', 'Kendall', 'Shiloh', 'Hayden', 'Arden', 'Ellis', 'Corey', 'Micah', 'Frankie',
  'Noel', 'Devon', 'Wren', 'Dallas', 'Tatum', 'Shawn', 'Ariel', 'Jessie', 'Bailey', 'Lee'];
const LAST_NAMES = ['Bennett', 'Carter', 'Morgan', 'Brooks', 'Reed', 'Parker', 'Hayes', 'Foster', 'Collins', 'Turner',
  'Mitchell', 'Sullivan', 'Rivera', 'Coleman', 'Stewart', 'Bailey', 'Cooper', 'Richardson', 'Gray', 'Howard',
  'Watson', 'Peterson', 'Sanders', 'Hughes', 'Price', 'Griffin', 'Powell', 'Russell', 'Butler', 'Simmons',
  'Ward', 'Torres', 'Murphy', 'Cook', 'Rogers', 'Morris', 'Bell', 'Campbell', 'Adams', 'Nelson',
  'Hill', 'Scott', 'Green', 'Baker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Lopez'];
const EDITIONS = ['Neighborhood Edition', 'Community Session', 'Evening Gathering', 'Local Spotlight', 'Seasonal Showcase'];
const RECIPIENT_IDS = ['6ae7814e7d5f88664b48dc90', '6ae7ad81d75d3755e55f82d3', '6aeb4f6c9b286ace01de1aea'];
const id = value => String(value?._id ?? value);
const instant = value => value == null ? NaN : new Date(value).getTime();
const digest = value => createHash('sha256').update(value).digest('hex');
const seededId = value => new mongoose.Types.ObjectId(digest(`${PREFIX}:${value}`).slice(0, 24));
const numberFor = value => parseInt(digest(value).slice(0, 8), 16);
const demos = Array.from({ length: DEMO_COUNT }, (_, index) => {
  const suffix = String(index + 1).padStart(3, '0');
  const username = `nearmecommunity${suffix}`;
  return { _id: seededId(`user:${suffix}`), firstName: FIRST_NAMES[index], lastName: LAST_NAMES[index],
    username, email: `${username}@example.invalid`, index };
});

class DemoCommunityError extends Error {
  constructor(message) { super(message); this.name = 'DemoCommunityError'; this.code = 'DEMO_COMMUNITY_PRECONDITION'; }
}

function validNow(value) {
  const now = new Date(value);
  if (!Number.isFinite(now.getTime())) throw new DemoCommunityError('A valid current instant is required.');
  return now;
}
function validSchedule(event) {
  return Number.isFinite(instant(event.startsAt)) && Number.isFinite(instant(event.endsAt)) &&
    instant(event.startsAt) < instant(event.endsAt) &&
    Number.isFinite(instant(event.registrationClosesAt || event.startsAt)) &&
    instant(event.registrationClosesAt || event.startsAt) <= instant(event.startsAt);
}
function completed(event, now) {
  return event.status !== 'cancelled' && validSchedule(event) && instant(event.endsAt) <= now.getTime();
}
function supportedCategories(event) {
  const values = Array.isArray(event.categories) && event.categories.length ? event.categories : [event.category];
  return [...new Set(values)].filter(value => EVENT_CATEGORIES.includes(value));
}
function usableTemplate(event) {
  if (!event || typeof event.title !== 'string' || !event.title.trim() || typeof event.address !== 'string' || !event.address.trim() ||
      typeof event.place !== 'string' || !event.place.trim() || typeof event.timeZone !== 'string' ||
      !event.timeZone.trim() || !supportedCategories(event).length) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: event.timeZone }).format(); return true; }
  catch { return false; }
}
function matchesDemo(account, demo) {
  return account && id(account) === id(demo) && account.username === demo.username && account.email === demo.email &&
    account.firstName === demo.firstName && account.lastName === demo.lastName && account.deletedAt == null;
}

// Reserved identities and deterministic IDs make a rerun reuse exactly the same
// fifty accounts. A similar-looking existing account is never adopted or edited.
async function readDemoAccounts(session) {
  const matches = await User.find({ $or: [
    { _id: { $in: demos.map(demo => demo._id) } },
    { username: { $in: demos.map(demo => new RegExp(`^${demo.username}$`, 'i')) } },
    { email: { $in: demos.map(demo => demo.email) } },
  ] }).select('_id firstName lastName username email deletedAt createdAt').session(session ?? null).lean();
  const found = new Map();
  for (const account of matches) {
    const demo = demos.find(candidate => id(candidate) === id(account) || candidate.username.toLowerCase() === account.username?.toLowerCase() || candidate.email === account.email);
    if (!demo || !matchesDemo(account, demo) || found.has(demo.username)) {
      throw new DemoCommunityError('A reserved community identity is occupied, renamed, or closed. No existing account will be replaced.');
    }
    found.set(demo.username, account);
  }
  if (found.size) {
    const userIds = [...found.values()].map(account => account._id);
    const profiles = await UserProfile.find({ userId: { $in: userIds } }).select('userId').session(session ?? null).lean();
    const security = await AccountSecurity.find({ userId: { $in: userIds } }).select('userId').session(session ?? null).lean();
    if (new Set(profiles.map(row => id(row.userId))).size !== found.size || new Set(security.map(row => id(row.userId))).size !== found.size) {
      throw new DemoCommunityError('An existing community account lacks its profile or security record; this import does not replace credentials.');
    }
  }
  return found;
}

async function sourceData(now) {
  const [accounts, events, existingDemos, photoRows] = await Promise.all([
    User.find({ deletedAt: null }).select('_id username createdAt').lean(),
    Event.find({}).sort({ _id: 1 }).lean(), readDemoAccounts(),
    EventPhoto.find({}).select('eventId displayOrder').lean(),
  ]);
  const activeIds = new Set(accounts.map(account => id(account)));
  const ownedEvents = events.filter(event => activeIds.has(id(event.hostId)));
  const photoEventIds = new Set(photoRows.map(photo => id(photo.eventId)));
  const hosts = accounts.filter(account => ownedEvents.some(event => id(event.hostId) === id(account)))
    .sort((left, right) => id(left).localeCompare(id(right)));
  if (!hosts.length) throw new DemoCommunityError('No active event owners are available for community population.');
  const allSeedKeys = new Set(events.map(event => event.seedKey).filter(Boolean));
  const fallback = ownedEvents.find(event => usableTemplate(event) && photoEventIds.has(id(event)));
  const additions = [];
  const hostSummaries = [];
  for (const [hostIndex, host] of hosts.entries()) {
    const own = ownedEvents.filter(event => id(event.hostId) === id(host));
    const count = own.filter(event => completed(event, now)).length;
    const needed = Math.max(0, COMPLETED_MINIMUM - count);
    const source = own.find(event => usableTemplate(event) && photoEventIds.has(id(event))) || fallback;
    if (needed && !source) throw new DemoCommunityError('A host has no reusable real-venue event/photo template. No synthetic address or image will be substituted.');
    let slot = 1;
    for (let index = 0; index < needed; index++) {
      while (allSeedKeys.has(`${PREFIX}:completed:${id(host)}:${slot}`)) slot++;
      const seedKey = `${PREFIX}:completed:${id(host)}:${slot}`;
      const row = historicalEvent(host, source, slot, hostIndex, now, seedKey);
      additions.push({ row, sourceId: source._id, sourceHostId: source.hostId, sourceUpdatedAt: source.updatedAt });
      allSeedKeys.add(seedKey); slot++;
    }
    hostSummaries.push({ id: id(host), username: host.username, completedBefore: count, completedToAdd: needed, completedAfter: count + needed });
  }
  return { now, existingDemos, hosts, ownedEvents, additions, hostSummaries, photoRows };
}

function historicalEvent(host, source, slot, hostIndex, now, seedKey) {
  const desiredEnd = now.getTime() - (slot * 7 + 3 + hostIndex % 4) * DAY;
  // Keep new historical editions inside the owner's known account lifetime.
  const ownerCreated = Number.isFinite(instant(host.createdAt)) ? instant(host.createdAt) : desiredEnd - 30 * DAY;
  const end = Math.max(desiredEnd, ownerCreated + 3 * HOUR + slot * 60000);
  if (end >= now.getTime()) throw new DemoCommunityError('A very recently created host has not existed long enough for completed demo events. Existing account timestamps will not be changed.');
  const startsAt = new Date(end - 2 * HOUR);
  const createdAt = new Date(Math.max(ownerCreated, startsAt.getTime() - 21 * DAY));
  const baseTitle = source.title.replace(/\b(?:demo|sample|test|past)\b/gi, '').replace(/\s+/g, ' ').replace(/^[\s\-–—·:]+|[\s\-–—·:]+$/g, '') || `${supportedCategories(source)[0]} Gathering`;
  return {
    _id: seededId(seedKey), hostId: host._id, seedKey,
    title: `${baseTitle.slice(0, 110)} · ${EDITIONS[(slot - 1) % EDITIONS.length]}`,
    categories: supportedCategories(source), price: Number.isFinite(source.price) && source.price >= 0 ? source.price : 0,
    startsAt, endsAt: new Date(end), status: 'published', cancelledAt: null, cancellationReason: '', notificationVersion: 0,
    registrationClosesAt: null, timeZone: source.timeZone, address: source.address, place: source.place,
    description: `Discover ${supportedCategories(source).join(' and ')} at ${source.place}. Enjoy the program, meet other local eventgoers, and connect with the neighborhood community.`,
    placeId: source.placeId ?? null, latitude: source.latitude ?? null, longitude: source.longitude ?? null,
    emoji: source.emoji, accent: source.accent, createdAt, updatedAt: createdAt,
  };
}

function selectionTime(event, demo, now) {
  const closes = instant(event.registrationClosesAt || event.startsAt);
  const latest = Math.min(now.getTime() - 1, closes - 1);
  const desired = Math.min(now.getTime() - (demo.index % 30 + 1) * 60000, closes - (2 + demo.index % 12) * DAY);
  const created = instant(event.createdAt);
  // New historical editions existed before their registrations. Some original
  // fixtures were imported after they ended: their Mongo insertion timestamp is
  // not a publication date, so retain that metadata and model prior attendance.
  const selected = Number.isFinite(created) && created <= latest ? Math.max(created, desired) : desired;
  return new Date(Math.min(selected, latest));
}
function selectionRow(event, demo, choices, now) {
  const selectedAt = selectionTime(event, demo, now);
  return { userId: demo._id, eventId: event._id, interested: choices.interested, attending: choices.attending,
    registrationVersion: choices.attending ? 1 : 0, selectionVersion: 1,
    registeredAt: choices.attending ? selectedAt : null, cancelledAt: null, savedAt: choices.interested ? selectedAt : null,
    createdAt: selectedAt, updatedAt: selectedAt };
}

// Each event receives a varied subset. Explicit round-robin coverage also gives
// every demo member one past attendance/rating and a different saved event.
function desiredSelections(events, now) {
  // Planned additions and persisted events must use the same coverage order.
  const eligible = events.filter(event => event.status !== 'cancelled' && validSchedule(event))
    .sort((first, second) => id(first).localeCompare(id(second)));
  const past = eligible.filter(event => completed(event, now));
  const future = eligible.filter(event => instant(event.endsAt) > now.getTime());
  if (!past.length) throw new DemoCommunityError('Completed event coverage is unavailable.');
  const result = new Map(eligible.map(event => [id(event), new Map()]));
  for (const event of eligible) {
    const ranked = [...demos].filter(demo => id(demo) !== id(event.hostId)).sort((left, right) =>
      numberFor(`${id(event)}:${id(left)}`) - numberFor(`${id(event)}:${id(right)}`));
    const attendingCount = 8 + numberFor(`attendance:${id(event)}`) % 13;
    const interestedCount = 6 + numberFor(`interest:${id(event)}`) % 11;
    for (const [index, demo] of ranked.slice(0, attendingCount + interestedCount).entries()) {
      result.get(id(event)).set(id(demo), { attending: index < attendingCount, interested: index >= attendingCount || index % 3 === 0 });
    }
  }
  for (const demo of demos) {
    const pastOptions = past.filter(event => id(event.hostId) !== id(demo));
    if (!pastOptions.length) throw new DemoCommunityError('A community member has no eligible completed event to attend.');
    const attendedEvent = pastOptions[demo.index % pastOptions.length];
    const choices = result.get(id(attendedEvent)).get(id(demo)) || { interested: false, attending: false };
    result.get(id(attendedEvent)).set(id(demo), { ...choices, attending: true });
    const futureOptions = future.filter(event => id(event.hostId) !== id(demo));
    const alternatives = futureOptions.length ? futureOptions : eligible.filter(event => id(event) !== id(attendedEvent) && id(event.hostId) !== id(demo));
    if (alternatives.length) {
      const savedEvent = alternatives[demo.index % alternatives.length];
      const current = result.get(id(savedEvent)).get(id(demo)) || { interested: false, attending: false };
      result.get(id(savedEvent)).set(id(demo), { ...current, interested: true });
    }
  }
  return result;
}

async function planCommunity(now) {
  const data = await sourceData(now);
  const events = [...data.ownedEvents, ...data.additions.map(addition => addition.row)];
  const desired = desiredSelections(events, now);
  const [selections, ratings] = await Promise.all([
    EventSelection.find({ userId: { $in: demos.map(demo => demo._id) } }).lean(),
    EventRating.find({ userId: { $in: demos.map(demo => demo._id) } }).select('userId eventId score').lean(),
  ]);
  const existingSelections = new Map(selections.map(row => [`${id(row.eventId)}:${id(row.userId)}`, row]));
  const existingRatings = new Set(ratings.map(row => `${id(row.eventId)}:${id(row.userId)}`));
  let selectionsToAdd = 0; let ratingsToAdd = 0;
  for (const event of events.filter(event => desired.has(id(event)))) {
    for (const demo of demos) {
      const key = `${id(event)}:${id(demo)}`;
      const choices = desired.get(id(event)).get(id(demo));
      const existing = existingSelections.get(key);
      if (choices && !existing) selectionsToAdd++;
      if (completed(event, now) && (existing ? existing.attending : choices?.attending) && !existingRatings.has(key)) ratingsToAdd++;
    }
  }
  const earliest = Math.min(now.getTime() - 90 * DAY, ...events.filter(event => desired.has(id(event)))
    .map(event => instant(event.registrationClosesAt || event.startsAt) - 30 * DAY));
  const summary = {
    seed: PREFIX, demoAccountsTotal: DEMO_COUNT, existingDemoAccounts: data.existingDemos.size,
    accountsToAdd: DEMO_COUNT - data.existingDemos.size, profilesToAdd: DEMO_COUNT - data.existingDemos.size,
    securityRecordsToAdd: DEMO_COUNT - data.existingDemos.size,
    activeHostCount: data.hosts.length, hosts: data.hostSummaries,
    existingEvents: data.ownedEvents.length, completedEventsToAdd: data.additions.length,
    eventPhotosToAdd: data.additions.reduce((sum, addition) => sum + Math.min(5, data.photoRows.filter(photo => id(photo.eventId) === id(addition.sourceId)).length), 0),
    existingCancelledEventsExcluded: data.ownedEvents.filter(event => event.status === 'cancelled').length,
    invalidSchedulesExcluded: data.ownedEvents.filter(event => event.status !== 'cancelled' && !validSchedule(event)).length,
    selectionsToAdd, ratingsToAdd,
    existingIdentityOrCredentialFieldsChanged: 0, originalEventMetadataChanged: 0, originalPhotosChanged: 0,
    externalNotificationsSent: 0,
  };
  return { ...data, events, desired, accountCreatedAt: new Date(earliest), summary };
}

async function previewDemoCommunity({ now = new Date() } = {}) {
  return (await planCommunity(validNow(now))).summary;
}

// Applying requires the already-provisioned unique indexes; preview never
// provisions a collection, index, or account behind the caller's back.
async function requireIndexes() {
  const requirements = [
    [User, ['username']], [User, ['email']], [UserProfile, ['userId']], [AccountSecurity, ['userId']],
    [Event, ['seedKey']], [EventPhoto, ['eventId', 'displayOrder']],
    [EventSelection, ['userId', 'eventId']], [EventRating, ['userId', 'eventId']], [NotificationJob, ['key']],
  ];
  for (const [model, fields] of requirements) {
    const indexes = await model.collection.listIndexes().toArray();
    if (!indexes.some(index => index.unique && !index.partialFilterExpression &&
        (!index.sparse || model === Event) && Object.keys(index.key).length === fields.length && fields.every(field => index.key[field] === 1))) {
      throw new DemoCommunityError(`The required unique index on ${model.collection.name} (${fields.join(', ')}) must be provisioned before applying community data.`);
    }
  }
}
async function withAccounts(accountIds, write) {
  const ids = [...new Set(accountIds.map(id))].sort();
  return mongoose.connection.transaction(async session => {
    if (ids.length) {
      // Ordered writes follow the same account-ID locking order as ordinary
      // mutations, but use one round trip for a larger community transaction.
      const result = await User.bulkWrite(ids.map(accountId => ({ updateOne: {
        filter: { _id: accountId, deletedAt: null }, update: { $inc: { archiveWriteVersion: 1 } }, timestamps: false,
      } })), { session, ordered: true, timestamps: false });
      if (result.matchedCount !== ids.length) throw new DemoCommunityError('An account became unavailable. Rerun the read-only community preview before continuing.');
    }
    return write(session);
  });
}

async function createAccounts(plan) {
  const prepared = new Map();
  for (const demo of demos) {
    if (!plan.existingDemos.has(demo.username)) prepared.set(demo.username,
      await argon2.hash(randomBytes(48).toString('base64url'), { type: argon2.argon2id }));
  }
  return withAccounts([...plan.existingDemos.values()].map(account => account._id), async session => {
    const current = await readDemoAccounts(session);
    const missing = demos.filter(demo => !current.has(demo.username));
    if (missing.some(demo => !prepared.has(demo.username))) throw new DemoCommunityError('Community identities changed after planning. Preview again.');
    if (!missing.length) return 0;
    await User.insertMany(missing.map(({ index, ...demo }) => ({ ...demo, deletedAt: null,
      createdAt: plan.accountCreatedAt, updatedAt: plan.accountCreatedAt })), { session, timestamps: false });
    await UserProfile.insertMany(missing.map(demo => ({ userId: demo._id, phone: '', dob: '',
      bio: 'I enjoy discovering local events, meeting new people, and exploring music, art, and food around the city.',
      createdAt: plan.accountCreatedAt, updatedAt: plan.accountCreatedAt })), { session, timestamps: false });
    await AccountSecurity.insertMany(missing.map(demo => ({ userId: demo._id, passwordHash: prepared.get(demo.username),
      createdAt: plan.accountCreatedAt, updatedAt: plan.accountCreatedAt })), { session, timestamps: false });
    return missing.length;
  });
}

async function createHistoricalEvents(plan) {
  const totals = { events: 0, photos: 0 };
  for (const host of plan.hosts) {
    const planned = plan.additions.filter(addition => id(addition.row.hostId) === id(host));
    if (!planned.length) continue;
    const sourceId = planned[0].sourceId;
    const result = await withAccounts([host._id, planned[0].sourceHostId], async session => {
      const existing = await Event.find({ hostId: host._id }).session(session).lean();
      const needed = Math.max(0, COMPLETED_MINIMUM - existing.filter(event => completed(event, plan.now)).length);
      if (!needed) return { events: 0, photos: 0 };
      const source = await Event.findById(sourceId).session(session).lean();
      if (!usableTemplate(source) || id(source.hostId) !== id(planned[0].sourceHostId)) throw new DemoCommunityError('A source venue changed. Preview the community import again.');
      if (Number.isFinite(instant(planned[0].sourceUpdatedAt)) && instant(source.updatedAt) !== instant(planned[0].sourceUpdatedAt)) {
        throw new DemoCommunityError('A source event changed after planning. Preview the community import again.');
      }
      const photos = await EventPhoto.find({ eventId: sourceId }).select('+imageData').sort({ displayOrder: 1 }).limit(5).session(session).lean();
      if (!photos.length) throw new DemoCommunityError('A source event has no reusable real photos. No placeholder images were created.');
      const rows = planned.filter(addition => !existing.some(event => event.seedKey === addition.row.seedKey)).slice(0, needed).map(addition => addition.row);
      if (rows.length !== needed) throw new DemoCommunityError('Completed-event counts changed after planning. Preview again.');
      await Event.insertMany(rows, { session, timestamps: false });
      const copies = rows.flatMap(event => photos.map((photo, displayOrder) => ({ eventId: event._id, displayOrder,
        imageData: photo.imageData, imageMimeType: photo.imageMimeType, createdAt: event.createdAt, updatedAt: event.updatedAt })));
      await EventPhoto.insertMany(copies, { session, timestamps: false });
      return { events: rows.length, photos: copies.length };
    });
    totals.events += result.events; totals.photos += result.photos;
  }
  return totals;
}

async function populateSelections(now) {
  const activeHosts = await User.find({ deletedAt: null }).select('_id').lean();
  const events = await Event.find({ hostId: { $in: activeHosts.map(account => account._id) } }).sort({ _id: 1 }).lean();
  const desired = desiredSelections(events, now);
  const totals = { selections: 0, ratings: 0, reminderJobsScheduled: 0 };
  for (const original of events.filter(event => desired.has(id(event)))) {
    const choices = desired.get(id(original));
    const result = await withAccounts([original.hostId, ...demos.map(demo => demo._id)], async session => {
      const event = await Event.findOne({ _id: original._id, hostId: original.hostId }).session(session).lean();
      if (!event || event.status === 'cancelled' || !validSchedule(event)) return { selections: 0, ratings: 0, reminderJobsScheduled: 0 };
      const existing = await EventSelection.find({ eventId: event._id, userId: { $in: demos.map(demo => demo._id) } }).session(session).lean();
      const byUser = new Map(existing.map(row => [id(row.userId), row]));
      const missing = demos.filter(demo => choices.has(id(demo)) && !byUser.has(id(demo)) && id(demo) !== id(event.hostId))
        .map(demo => selectionRow(event, demo, choices.get(id(demo)), now));
      if (missing.length) {
        const saved = await EventSelection.insertMany(missing, { session, timestamps: false });
        for (const row of saved) byUser.set(id(row.userId), row.toObject());
      }
      let reminderJobsScheduled = 0;
      // This only enqueues still-future reminders. There are no provider calls or
      // immediate registration messages; the separate truth-repair owns those.
      if (instant(event.endsAt) > now.getTime()) {
        for (const row of missing) reminderJobsScheduled += await scheduleSelectionNotifications(event, row, session, { now });
      }
      let ratings = [];
      if (completed(event, now)) {
        const existingRatings = await EventRating.find({ eventId: event._id, userId: { $in: demos.map(demo => demo._id) } }).select('userId').session(session).lean();
        const rated = new Set(existingRatings.map(row => id(row.userId)));
        const attending = demos.filter(demo => id(demo) !== id(event.hostId) && byUser.get(id(demo))?.attending);
        ratings = attending.filter(demo => !rated.has(id(demo))).map((demo, index) => {
          const createdAt = new Date(Math.min(now.getTime(), instant(event.endsAt) + (demo.index % 12 + 1) * HOUR));
          return { userId: demo._id, eventId: event._id, score: (index + numberFor(`rating:${id(event)}`)) % 5 + 1, createdAt, updatedAt: createdAt };
        });
        if (ratings.length) await EventRating.insertMany(ratings, { session, timestamps: false });
      }
      return { selections: missing.length, ratings: ratings.length, reminderJobsScheduled };
    });
    for (const field of Object.keys(totals)) totals[field] += result[field];
  }
  return totals;
}

async function coverage(now) {
  const accounts = await readDemoAccounts();
  const userIds = [...accounts.values()].map(account => account._id);
  const [selections, ratings, events] = await Promise.all([
    EventSelection.find({ userId: { $in: userIds } }).select('userId eventId interested attending').lean(),
    EventRating.find({ userId: { $in: userIds } }).select('userId eventId').lean(),
    Event.find({}).select('_id hostId startsAt endsAt registrationClosesAt status').lean(),
  ]);
  const byEvent = new Map(events.map(event => [id(event), event]));
  const rated = new Set(ratings.map(row => `${id(row.userId)}:${id(row.eventId)}`));
  const incomplete = [];
  for (const demo of demos) {
    const selected = selections.filter(row => id(row.userId) === id(demo));
    const past = selected.filter(row => row.attending && byEvent.has(id(row.eventId)) && completed(byEvent.get(id(row.eventId)), now));
    const missingRating = past.some(row => !rated.has(`${id(demo)}:${id(row.eventId)}`));
    const otherSaved = selected.some(row => row.interested && past.some(attended => id(attended.eventId) !== id(row.eventId)));
    if (!past.length || missingRating || !otherSaved) incomplete.push(demo.username);
  }
  return { demoAccounts: accounts.size, selectedDemoAccounts: new Set(selections.filter(row => row.attending || row.interested).map(row => id(row.userId))).size,
    ratedDemoAccounts: new Set(ratings.map(row => id(row.userId))).size, demoSelectionsTotal: selections.length,
    demoRatingsTotal: ratings.length, incompleteCoverage: incomplete };
}

async function populateDemoCommunity({ now = new Date() } = {}) {
  const current = validNow(now);
  await requireIndexes();
  const plan = await planCommunity(current);
  const accounts = await createAccounts(plan);
  const history = await createHistoricalEvents(plan);
  const choices = await populateSelections(current);
  const finalCoverage = await coverage(current);
  const finalData = await sourceData(current);
  if (finalCoverage.demoAccounts !== DEMO_COUNT || finalCoverage.incompleteCoverage.length ||
      finalData.hostSummaries.some(host => host.completedBefore < COMPLETED_MINIMUM)) {
    throw new DemoCommunityError('The import has incomplete coverage after concurrent changes. Existing records were preserved; rerun the preview to complete the idempotent import.');
  }
  return { seed: PREFIX, applied: true, accountsCreated: accounts, profilesCreated: accounts, securityRecordsCreated: accounts,
    completedEventsCreated: history.events, eventPhotosCreated: history.photos,
    selectionsCreated: choices.selections, ratingsCreated: choices.ratings, reminderJobsScheduled: choices.reminderJobsScheduled,
    coverage: finalCoverage, hosts: finalData.hostSummaries.map(host => ({ id: host.id, username: host.username, completedEvents: host.completedBefore })),
    originalEventMetadataChanged: 0, originalPhotosChanged: 0, existingSelectionsOverwritten: 0,
    existingRatingsOverwritten: 0, externalNotificationsSent: 0 };
}

// These existing identities are pinned by ID, never guessed from a display name.
// Existing dated registrations are reusable facts. Undated legacy attendance is
// retained without inventing a registration time or touching its saved choices.
async function notificationRecipientPlan(now) {
  const recipients = await User.find({ _id: { $in: RECIPIENT_IDS }, deletedAt: null }).select('_id username').lean();
  if (recipients.length !== RECIPIENT_IDS.length) throw new DemoCommunityError('A notification recipient is unavailable. No replacement account will be chosen.');
  const candidates = await Event.find({ status: { $ne: 'cancelled' }, startsAt: { $gt: now }, endsAt: { $gt: now },
    $or: [{ registrationClosesAt: null }, { registrationClosesAt: { $gt: now } }],
  }).sort({ startsAt: 1, _id: 1 }).lean();
  const hosts = await User.find({ _id: { $in: candidates.map(event => event.hostId) }, deletedAt: null }).select('_id').lean();
  const activeHosts = new Set(hosts.map(host => id(host)));
  const selections = await EventSelection.find({ userId: { $in: RECIPIENT_IDS }, eventId: { $in: candidates.map(event => event._id) } }).lean();
  return RECIPIENT_IDS.map(recipientId => {
    const account = recipients.find(recipient => id(recipient) === recipientId);
    const available = candidates.filter(event => activeHosts.has(id(event.hostId)) && id(event.hostId) !== recipientId &&
      validSchedule(event) && instant(event.registrationClosesAt || event.startsAt) > now.getTime());
    const byEvent = new Map(selections.filter(row => id(row.userId) === recipientId).map(row => [id(row.eventId), row]));
    const dated = available.filter(event => {
      const row = byEvent.get(id(event));
      return row?.attending && Number.isFinite(instant(row.registeredAt)) && instant(row.registeredAt) <= now.getTime() && instant(row.registeredAt) < instant(event.startsAt);
    });
    const unregistered = available.filter(event => !byEvent.get(id(event))?.attending)
      .sort((left, right) => Number(Boolean(byEvent.get(id(right))?.interested)) - Number(Boolean(byEvent.get(id(left))?.interested)) || instant(left.startsAt) - instant(right.startsAt) || id(left).localeCompare(id(right)));
    const chosen = [...dated, ...unregistered].slice(0, 2);
    if (chosen.length !== 2) throw new DemoCommunityError('A notification recipient has fewer than two available events hosted by other active accounts.');
    return { account, events: chosen, existingSelections: byEvent };
  });
}

function recipientPreview(rows) {
  return { recipientCount: rows.length, selectedEventLinks: rows.length * 2,
    registrationsToAdd: rows.reduce((sum, row) => sum + row.events.filter(event => !row.existingSelections.get(id(event))?.attending).length, 0),
    recipients: rows.map(row => ({ userId: id(row.account), username: row.account.username,
      events: row.events.map(event => ({ eventId: id(event), title: event.title, startsAt: event.startsAt,
        alreadyAttending: Boolean(row.existingSelections.get(id(event))?.attending),
        interested: Boolean(row.existingSelections.get(id(event))?.interested) })) })),
    originalPastAttendanceChanged: 0, originalRatingsChanged: 0, externalNotificationsSent: 0 };
}

async function previewNotificationRecipientRegistrations({ now = new Date() } = {}) {
  return recipientPreview(await notificationRecipientPlan(validNow(now)));
}

async function registerNotificationRecipients({ now = new Date() } = {}) {
  const current = validNow(now);
  await requireIndexes();
  const plan = await notificationRecipientPlan(current);
  let registrationsCreated = 0;
  const recipients = [];
  for (const row of plan) {
    const result = await withAccounts([row.account._id, ...row.events.map(event => event.hostId)], async session => {
      const selections = [];
      let created = 0;
      for (const planned of row.events) {
        const event = await Event.findOne({ _id: planned._id, hostId: planned.hostId }).session(session).lean();
        if (!event || event.status === 'cancelled' || !validSchedule(event) || id(event.hostId) === id(row.account) ||
            instant(event.startsAt) <= current.getTime() || instant(event.registrationClosesAt || event.startsAt) <= current.getTime()) {
          throw new DemoCommunityError('A selected registration event changed or closed. Preview the registration links again.');
        }
        const before = await EventSelection.findOne({ userId: row.account._id, eventId: event._id }).session(session).lean();
        // This normal transition preserves Interested and produces the same
        // registration outbox fact/reminders as an app registration would.
        const after = await writeEventSelection(row.account._id, event, { attending: true }, session, { now: current });
        if (!before?.attending) created++;
        selections.push({ eventId: id(event), title: event.title, startsAt: event.startsAt,
          attending: Boolean(after.attending), interested: Boolean(after.interested), registeredAt: after.registeredAt });
      }
      return { created, selections };
    });
    registrationsCreated += result.created;
    recipients.push({ userId: id(row.account), username: row.account.username, registrationsCreated: result.created, selections: result.selections });
  }
  return { applied: true, recipientCount: recipients.length, selectedEventLinks: recipients.length * 2,
    registrationsCreated, recipients, originalPastAttendanceChanged: 0, originalRatingsChanged: 0, externalNotificationsSent: 0 };
}

module.exports = { previewDemoCommunity, populateDemoCommunity, DemoCommunityError, DEMO_COMMUNITY_PREFIX: PREFIX,
  DEMO_USERNAMES: demos.map(demo => demo.username), previewNotificationRecipientRegistrations, registerNotificationRecipients };

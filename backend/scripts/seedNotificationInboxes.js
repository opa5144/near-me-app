// Preview by default; --apply adds only the 30 approved in-app notification records.
// This script deliberately does not import the conflicted routers or start the app.
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const mongoose = require('mongoose');
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
const Notification = require('../src/models/Notification');
const { NOTIFICATION_TYPES } = require('../src/constants/notificationTypes');
const { notificationKey } = require('../src/services/notifications/keys');
const { renderNotification } = require('../src/services/notifications/templates');

const REQUESTED_NAMES = ['patrick', 'joshua', 'demi'];
// These are the three account IDs supplied by the user earlier in this session.
// Pinning them prevents a duplicate first name from selecting another account.
const ACCOUNT_IDS = {
  patrick: '6ae7814e7d5f88664b48dc90',
  joshua: '6aeb4f6c9b286ace01de1aea',
  demi: '6ae7ad81d75d3755e55f82d3',
};
const SEED = 'notification-inbox-preview-2026-11-14-v1';
const APPLY = process.argv.includes('--apply');
class SeedError extends Error {}
const active = user => user && user.deletedAt == null;
const id = value => String(value);
const instant = value => value instanceof Date ? value.getTime() : NaN;

async function makePlan(db, session) {
  const options = session ? { session } : {};
  const users = await db.collection('AccountList').find({ deletedAt: null }, {
    ...options, projection: { _id: 1, username: 1, firstName: 1, deletedAt: 1 },
  }).toArray();
  const accounts = REQUESTED_NAMES.map(name => {
    const exact = users.filter(user => user.username?.toLowerCase() === name);
    const matches = exact.length ? exact : users.filter(user => user.firstName?.toLowerCase() === name);
    const chosen = matches.find(user => id(user._id) === ACCOUNT_IDS[name]);
    if (!chosen) throw new SeedError(`The previously supplied active account ID does not match ${name}; resolve it before seeding.`);
    return { requestedName: name, user: chosen };
  });
  if (new Set(accounts.map(account => id(account.user._id))).size !== 3) throw new SeedError('The three names must resolve to three different accounts.');
  const hosts = new Map(users.map(user => [id(user._id), user]));
  const now = new Date();
  const events = (await db.collection('eventList').find({
    startsAt: { $type: 'date' }, endsAt: { $type: 'date' },
  }, { ...options, projection: {
    _id: 1, hostId: 1, title: 1, startsAt: 1, endsAt: 1, timeZone: 1, place: 1,
    address: 1, registrationClosesAt: 1, status: 1, cancellationReason: 1,
  } }).toArray()).filter(event => active(hosts.get(id(event.hostId))) && instant(event.startsAt) < instant(event.endsAt));
  const plans = [];
  for (const account of accounts) {
    const choices = await db.collection('EventSelections').find({ userId: account.user._id }, {
      ...options, projection: { eventId: 1, attending: 1, interested: 1 },
    }).toArray();
    const ratings = await db.collection('eventRatings').find({ userId: account.user._id }, {
      ...options, projection: { eventId: 1 },
    }).toArray();
    const rated = new Set(ratings.map(rating => id(rating.eventId)));
    const selections = new Map(choices.map(choice => [id(choice.eventId), choice]));
    const otherEvents = events.filter(event => id(event.hostId) !== id(account.user._id));
    const published = otherEvents.filter(event => event.status !== 'cancelled');
    const upcoming = published.filter(event => instant(event.startsAt) > now.getTime())
      .sort((a, b) => instant(a.startsAt) - instant(b.startsAt));
    const base = upcoming.find(event => selections.has(id(event._id))) || upcoming[0] || published[0] || otherEvents[0];
    if (!base) throw new SeedError(`No real event from another active host is available for ${account.requestedName}.`);
    const eligible = published.filter(event => instant(event.endsAt) <= now.getTime() && selections.get(id(event._id))?.attending);
    const ratingEvent = eligible.find(event => !rated.has(id(event._id))) || eligible[0] ||
      published.find(event => instant(event.endsAt) <= now.getTime()) || base;
    const cancelled = otherEvents.find(event => event.status === 'cancelled') || base;
    const rows = [];
    for (const type of NOTIFICATION_TYPES.filter(value => value !== 'EVENT_INVITE')) {
      const event = type === 'RATE_ATTENDED_EVENT' ? ratingEvent : type === 'EVENT_CANCELLED' ? cancelled : base;
      const payload = {
        occurredAt: now.toISOString(), expectedStartsAt: event.startsAt.toISOString(),
        expectedEndsAt: event.endsAt.toISOString(), expectedClosesAt: (event.registrationClosesAt || event.startsAt).toISOString(),
      };
      const content = renderNotification(type, { event, eventSnapshot: event,
        host: hosts.get(id(event.hostId)), payload, job: { type, payload, createdAt: now, dueAt: now } });
      const canRate = type === 'RATE_ATTENDED_EVENT' && eligible.some(candidate => id(candidate._id) === id(event._id));
      const row = {
        _id: new mongoose.Types.ObjectId(), userId: account.user._id, eventId: event._id, actorId: event.hostId,
        type, title: '[Test] ' + content.title,
        message: 'Test preview: ' + content.message + (type === 'RATE_ATTENDED_EVENT' && !canRate
          ? ' Rating eligibility is unchanged; this account may be unable to submit a rating.' : ''),
        data: { ...content.data, testSeed: SEED, isTest: true }, action: content.action,
        channels: ['inApp'], isRead: false, readAt: null, occurredAt: now, createdAt: now, updatedAt: now,
        dedupeKey: notificationKey(SEED, account.user._id, type),
      };
      try { await new Notification(row).validate(); }
      catch { throw new SeedError('A test notification does not satisfy the current schema.'); }
      rows.push(row);
    }
    const existing = await db.collection('notifications').countDocuments({ userId: account.user._id, 'data.testSeed': SEED }, options);
    plans.push({ ...account, rows, existing, ratingEligible: eligible.some(event => id(event._id) === id(ratingEvent._id)),
      ratingEventTitle: ratingEvent.title, baseEventTitle: base.title });
  }
  return plans;
}

async function main() {
  const deadline = setTimeout(() => { console.error('Notification seed stopped: database operation timed out.'); process.exit(1); }, 30000);
  deadline.unref();
  try {
    if (!process.env.MONGO_URI) throw new SeedError('MONGO_URI is not configured.');
    console.log(APPLY ? 'Connecting to Atlas for the approved notification import.' : 'Connecting to Atlas for a read-only seed preview.');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 8000, socketTimeoutMS: 10000 });
    const db = mongoose.connection.db;
    if (process.argv.includes('--list-accounts')) {
      const accounts = await db.collection('AccountList').find({ deletedAt: null }, {
        projection: { _id: 1, username: 1, firstName: 1 },
      }).toArray();
      console.log(JSON.stringify({ mode: 'account-names-only', accounts }, null, 2));
      return;
    }
    let plans = await makePlan(db);
    let inserted = 0;
    if (APPLY) {
      const indexes = await db.collection('notifications').listIndexes().toArray();
      if (!indexes.some(index => index.unique && index.key?.dedupeKey === 1)) {
        throw new SeedError('Initialize the notification deduplication index before importing.');
      }
      // All-or-nothing, insert-only: stable seed keys make reruns preserve read state and existing records.
      await mongoose.connection.transaction(async session => {
        plans = await makePlan(db, session);
        const result = await db.collection('notifications').bulkWrite(plans.flatMap(plan => plan.rows.map(row => ({
          updateOne: { filter: { dedupeKey: row.dedupeKey }, update: { $setOnInsert: row }, upsert: true },
        }))), { session, ordered: true });
        inserted = result.upsertedCount;
      });
    }
    const report = [];
    for (const plan of plans) {
      const stored = await db.collection('notifications').countDocuments({ userId: plan.user._id, 'data.testSeed': SEED });
      report.push({ requestedName: plan.requestedName, username: plan.user.username, planned: plan.rows.length,
        existingBefore: plan.existing, stored, ratingEligible: plan.ratingEligible,
        ratingEvent: plan.ratingEventTitle, otherEvent: plan.baseEventTitle });
    }
    console.log(JSON.stringify({ mode: APPLY ? 'applied' : 'preview', seed: SEED, inserted, accounts: report }, null, 2));
  } catch (error) {
    console.error(error instanceof SeedError ? error.message : `Notification seed failed: ${error.name}.`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    clearTimeout(deadline);
  }
}
if (require.main === module) main();

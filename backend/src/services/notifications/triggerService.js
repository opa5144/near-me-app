const NotificationJob = require('../../models/NotificationJob');
const EventSelection = require('../../models/EventSelection');
const OrganizerFollow = require('../../models/OrganizerFollow');
const { NOTIFICATION_TYPES } = require('../../constants/notificationTypes');
const { getNotificationConfig } = require('../../config/notifications');
const { notificationKey } = require('./keys');

const HOUR = 60 * 60 * 1000;
const FANOUT_SIZE = 500;
const generation = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const idOf = value => String(value?._id ?? value);
const iso = value => new Date(value).toISOString();

// This is an outbox write only. Source facts and their jobs commit together;
// delivery/provider calls must happen later, outside retryable domain writes.
async function enqueueJob(session, { key, kind, type, userId, eventId, actorId, dueAt, expiresAt, payload }) {
  if (!session?.inTransaction()) throw new Error('Notification jobs require an active transaction.');
  const due = new Date(dueAt);
  if (typeof key !== 'string' || !key || !['notification', 'fanout', 'delivery', 'pushReceipt'].includes(kind) ||
      (type !== undefined && !NOTIFICATION_TYPES.includes(type)) || !Number.isFinite(due.getTime())) {
    throw new Error('Invalid notification job.');
  }
  const expiry = expiresAt == null ? null : new Date(expiresAt);
  if (expiry && !Number.isFinite(expiry.getTime())) throw new Error('Invalid notification job expiry.');
  return NotificationJob.updateOne({ key }, { $setOnInsert: {
    key, kind, ...(type ? { type } : {}), ...(userId ? { userId } : {}),
    ...(eventId ? { eventId } : {}), ...(actorId ? { actorId } : {}),
    dueAt: due, expiresAt: expiry, state: 'pending', attempts: 0, leaseOwner: null, leaseUntil: null,
    payload: payload ?? {},
  } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true, session });
}

function eventSnapshot(event) {
  return {
    id: idOf(event._id), hostId: idOf(event.hostId), title: event.title,
    place: event.place, address: event.address, placeId: event.placeId ?? null,
    latitude: event.latitude ?? null, longitude: event.longitude ?? null,
    startsAt: iso(event.startsAt), endsAt: iso(event.endsAt),
    registrationClosesAt: iso(event.registrationClosesAt || event.startsAt), timeZone: event.timeZone,
    status: event.status === 'cancelled' ? 'cancelled' : 'published',
    cancelledAt: event.cancelledAt ? iso(event.cancelledAt) : null,
    cancellationReason: event.cancellationReason || '',
  };
}

function contextFor(event, occurredAt, changes) {
  return {
    eventVersion: generation(event.notificationVersion), occurredAt: iso(occurredAt),
    eventSnapshot: eventSnapshot(event), ...(changes ? { changes } : {}),
  };
}

// One scheduling authority is shared with restart reconciliation. Missed due
// times are never backfilled; existing legacy choices get future reminders only.
async function scheduleSelectionNotifications(event, selection, session, { now = new Date() } = {}) {
  if (event.status === 'cancelled') return 0;
  const currentTime = new Date(now).getTime();
  const start = new Date(event.startsAt).getTime();
  const end = new Date(event.endsAt).getTime();
  const closing = new Date(event.registrationClosesAt || event.startsAt).getTime();
  if (![currentTime, start, end, closing].every(Number.isFinite) || end <= start || closing > start) return 0;
  const eventVersion = generation(event.notificationVersion);
  const registrationVersion = generation(selection.registrationVersion);
  const selectionVersion = generation(selection.selectionVersion);
  const { graceMs } = getNotificationConfig();
  const payload = {
    eventVersion, registrationVersion, selectionVersion,
    expectedStartsAt: iso(event.startsAt), expectedEndsAt: iso(event.endsAt),
    expectedClosesAt: iso(event.registrationClosesAt || event.startsAt), occurredAt: iso(now),
  };
  const schedules = [];
  if (selection.attending) {
    schedules.push(['EVENT_STARTS_24H', start - 24 * HOUR], ['EVENT_STARTS_1H', start - HOUR], ['RATE_ATTENDED_EVENT', end + HOUR]);
  } else if (selection.interested) schedules.push(['SAVED_EVENT_REGISTRATION_CLOSING', closing - 24 * HOUR]);
  let count = 0;
  for (const [type, due] of schedules) {
    if (due < currentTime) continue;
    const versions = type === 'SAVED_EVENT_REGISTRATION_CLOSING'
      ? [registrationVersion, selectionVersion] : [registrationVersion];
    const key = notificationKey('scheduled', type, selection.userId, event._id, eventVersion,
      ...versions, payload.expectedStartsAt, payload.expectedEndsAt, payload.expectedClosesAt);
    await enqueueJob(session, {
      key, kind: 'notification', type, userId: selection.userId, eventId: event._id, actorId: event.hostId,
      dueAt: new Date(due), expiresAt: new Date(due + graceMs), payload,
    });
    count++;
  }
  return count;
}

async function recordSelectionChange({ before, after, event, occurredAt }, session) {
  const registrationChanged = Boolean(before?.attending) !== Boolean(after.attending);
  if (registrationChanged) {
    const type = after.attending ? 'REGISTRATION_CONFIRMED' : 'REGISTRATION_CANCELLED';
    await enqueueJob(session, {
      key: notificationKey('registration', type, after.userId, event._id, generation(after.registrationVersion)),
      kind: 'notification', type, userId: after.userId, eventId: event._id, actorId: after.userId,
      dueAt: occurredAt,
      payload: {
        registrationVersion: generation(after.registrationVersion), selectionVersion: generation(after.selectionVersion),
        context: contextFor(event, occurredAt),
      },
    });
  }
  await scheduleSelectionNotifications(event, after, session, { now: occurredAt });
}

async function enqueueFanout(type, event, recipientIds, context, session) {
  const recipients = [...new Set(recipientIds.map(idOf))].sort();
  for (let offset = 0; offset < recipients.length; offset += FANOUT_SIZE) {
    await enqueueJob(session, {
      key: notificationKey('fanout', type, event._id, generation(event.notificationVersion), offset / FANOUT_SIZE),
      kind: 'fanout', type, eventId: event._id, actorId: event.hostId, dueAt: new Date(context.occurredAt),
      payload: { recipientIds: recipients.slice(offset, offset + FANOUT_SIZE), context },
    });
  }
}

async function selectedAudience(eventId, session) {
  const rows = await EventSelection.find({ eventId, $or: [{ interested: true }, { attending: true }] })
    .select('userId').session(session).lean();
  return rows.map(row => row.userId);
}

async function recordEventCreated(event, session) {
  const rows = await OrganizerFollow.find({ organizerId: event.hostId, active: true })
    .select('userId').session(session).lean();
  await enqueueFanout('FOLLOWED_ORGANIZER_NEW_EVENT', event, rows.map(row => row.userId),
    contextFor(event, event.createdAt || new Date()), session);
}

async function recordEventChanged({ after, changes, occurredAt }, session) {
  const types = [];
  if (changes.dateTime) types.push('EVENT_DATETIME_CHANGED');
  if (changes.location) types.push('EVENT_LOCATION_CHANGED');
  if (!types.length) return;
  const recipients = await selectedAudience(after._id, session);
  const context = contextFor(after, occurredAt, changes);
  for (const type of types) await enqueueFanout(type, after, recipients, context, session);
  // Future reminder keys include the new version. The worker's shared scheduling
  // reconciliation replaces stale generations without large host transactions.
}

async function recordEventCancelled({ after, occurredAt }, session) {
  await enqueueFanout('EVENT_CANCELLED', after, await selectedAudience(after._id, session),
    contextFor(after, occurredAt), session);
}

module.exports = {
  enqueueJob, scheduleSelectionNotifications, recordSelectionChange,
  recordEventCreated, recordEventChanged, recordEventCancelled,
};

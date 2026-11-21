const mongoose = require('mongoose');
const { findEvents, findEventById, withEventSnapshot } = require('../models/eventStore');
const EventSelection = require('../models/EventSelection');
const { toEventItem } = require('./eventData');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');
const { loadPhotoMetadata } = require('./photoCollectionService');
const { recordSelectionChange } = require('./notifications/triggerService');

function requireId(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value) || !mongoose.isObjectIdOrHexString(value)) {
    throw new ServiceError(400, 'Invalid ' + label + ' ID.');
  }
}

function selectedBy(userId) { return { userId, $or: [{ interested: true }, { attending: true }] }; }

function selectionItem(selection) {
  return {
    eventId: String(selection.eventId._id ?? selection.eventId),
    interested: Boolean(selection.interested), attending: Boolean(selection.attending),
  };
}

function bookingItem(selection, baseUrl, photos = []) {
  // History uses current event details, rather than claiming to store a purchase snapshot.
  return { id: String(selection._id), ...selectionItem(selection), event: toEventItem(selection.eventId, baseUrl, photos) };
}

async function hydrateSelections(selections, session, pastOnly = false) {
  const events = await findEvents({ _id: { $in: selections.map(row => row.eventId) }, status: { $ne: 'draft' },
    ...(pastOnly ? { endsAt: { $type: 'date', $lte: new Date() } } : {}),
  }, { session, populate: { path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null }, options: { session } } });
  const byId = new Map(events.filter(event => event.hostId).map(event => [String(event._id), event]));
  return selections.filter(row => byId.has(String(row.eventId))).map(row => ({ ...row, eventId: byId.get(String(row.eventId)) }));
}

async function listSelections(auth) {
  return withEventSnapshot(undefined, async session => {
    const selections = await EventSelection.find(selectedBy(auth.userId)).session(session).lean();
    return (await hydrateSelections(selections, session)).map(selectionItem);
  });
}

async function getBookingHistory(auth, baseUrl) {
  return withEventSnapshot(undefined, async session => {
    const selections = await EventSelection.find(selectedBy(auth.userId)).session(session).lean();
    const visible = await hydrateSelections(selections, session, true);
    visible.sort((a, b) => new Date(b.eventId.endsAt).getTime() - new Date(a.eventId.endsAt).getTime() ||
      String(b._id).localeCompare(String(a._id)));
    const photos = await loadPhotoMetadata('event', visible.map(selection => selection.eventId._id), session);
    return visible.map(selection => bookingItem(selection, baseUrl, photos.get(String(selection.eventId._id)) ?? []));
  });
}

async function getBooking(auth, id, baseUrl) {
  requireId(id, 'booking');
  return withEventSnapshot(undefined, async session => {
    const stored = await EventSelection.findOne({ _id: id, ...selectedBy(auth.userId) }).session(session).lean();
    const selection = stored ? (await hydrateSelections([stored], session, true))[0] : null;
    if (!selection?.eventId?.hostId) throw new ServiceError(404, 'Booking not found.');
    const photos = await loadPhotoMetadata('event', [selection.eventId._id], session);
    return bookingItem(selection, baseUrl, photos.get(String(selection.eventId._id)) ?? []);
  });
}

function selectionChanges(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ServiceError(400, 'Please submit your event selection.');
  }
  const changes = {};
  for (const flag of ['interested', 'attending']) {
    if (!Object.prototype.hasOwnProperty.call(body, flag)) continue;
    if (typeof body[flag] !== 'boolean') throw new ServiceError(400, 'Interested and attending must be true or false.');
    changes[flag] = body[flag];
  }
  if (!Object.keys(changes).length) {
    throw new ServiceError(400, 'Provide interested, attending, or both to update your selection.');
  }
  return changes;
}

// Call only after fencing the selecting account and the event's host. The caller
// supplies the event read inside that transaction, so invite acceptance and normal
// registration share the same cutoffs, generations, and notification facts.
async function writeEventSelection(userId, current, input, session, { now = new Date() } = {}) {
  if (!session?.inTransaction()) throw new Error('Event selections require an active transaction.');
  const changes = selectionChanges(input);
  if (!current?._id) throw new ServiceError(404, 'Event not found.');
  if (['cancelled', 'archived', 'draft'].includes(current.status)) throw new ServiceError(409, 'This event is unavailable. Its selections are read-only.');
  const occurredAt = new Date(now);
  if (!Number.isFinite(occurredAt.getTime())) throw new Error('Invalid event selection time.');
  const endsAt = new Date(current.endsAt).getTime();
  if (!Number.isFinite(endsAt) || endsAt <= occurredAt.getTime()) {
    throw new ServiceError(409, 'This event has ended. Past selections are read-only.');
  }
  const before = await EventSelection.findOne({ userId, eventId: current._id }).session(session).lean();
  const interested = changes.interested ?? Boolean(before?.interested);
  const attending = changes.attending ?? Boolean(before?.attending);
  const registrationChanged = attending !== Boolean(before?.attending);
  const interestChanged = interested !== Boolean(before?.interested);
  const closingTime = new Date(current.registrationClosesAt || current.endsAt).getTime();
  if (registrationChanged && attending && (!Number.isFinite(closingTime) || closingTime <= occurredAt.getTime())) {
    throw new ServiceError(409, 'Registration for this event has closed.');
  }
  // Repeating the same request neither changes its generation nor emits a fact.
  if (!registrationChanged && !interestChanged) return before || { eventId: current._id, userId, interested, attending };
  const registrationVersion = generation(before?.registrationVersion) + (registrationChanged ? 1 : 0);
  const selectionVersion = generation(before?.selectionVersion) + (interestChanged ? 1 : 0);
  const after = await EventSelection.findOneAndUpdate({ userId, eventId: current._id }, {
    $set: {
      interested, attending, registrationVersion, selectionVersion,
      registeredAt: registrationChanged && attending ? occurredAt : before?.registeredAt || null,
      cancelledAt: registrationChanged ? (attending ? null : occurredAt) : before?.cancelledAt || null,
      savedAt: interestChanged ? (interested ? occurredAt : null) : before?.savedAt || null,
    }, $setOnInsert: { userId, eventId: current._id },
  }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
  await recordSelectionChange({ before, after, event: current, occurredAt }, session);
  return after;
}

async function updateSelection(auth, eventId, body) {
  requireId(eventId, 'event');
  const changes = selectionChanges(body);
  try {
    // Index creation happens before the first upsert, outside the retryable transaction.
    await EventSelection.init();
    const event = await findEventById(eventId, { select: '_id hostId' });
    if (!event?.hostId) throw new ServiceError(404, 'Event not found.');
    const selection = await withActiveAccountWrite(auth, [event.hostId], async session => {
      const current = await findEventById(event._id, { session });
      if (!current) throw new ServiceError(404, 'Event not found.');
      return writeEventSelection(auth.userId, current, changes, session);
    });
    return selectionItem(selection);
  } catch (error) {
    if (error.code === 11000) throw new ServiceError(409, 'Your event selection changed. Please retry.');
    if (error.name === 'ValidationError') throw new ServiceError(400, 'Please check your event selection.');
    throw error;
  }
}

function generation(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }

module.exports = { listSelections, getBookingHistory, getBooking, updateSelection, writeEventSelection };

const mongoose = require('mongoose');
const Event = require('../models/Event');
const EventSelection = require('../models/EventSelection');
const { toEventItem } = require('./eventData');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');

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

function bookingItem(selection, baseUrl) {
  // History uses current event details, rather than claiming to store a purchase snapshot.
  return { id: String(selection._id), ...selectionItem(selection), event: toEventItem(selection.eventId, baseUrl) };
}

function pastEventPopulation(now) {
  return {
    path: 'eventId', match: { endsAt: { $lte: now } },
    populate: { path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null } },
  };
}

async function listSelections(auth) {
  const selections = await EventSelection.find(selectedBy(auth.userId)).populate({
    path: 'eventId', select: '_id hostId',
    populate: { path: 'hostId', select: '_id', match: { deletedAt: null } },
  }).lean();
  return selections.filter(selection => selection.eventId?.hostId).map(selectionItem);
}

async function getBookingHistory(auth, baseUrl) {
  const selections = await EventSelection.find(selectedBy(auth.userId))
    .populate(pastEventPopulation(new Date())).lean();
  const visible = selections.filter(selection => selection.eventId?.hostId);
  visible.sort((a, b) => new Date(b.eventId.endsAt).getTime() - new Date(a.eventId.endsAt).getTime() ||
    String(b._id).localeCompare(String(a._id)));
  return visible.map(selection => bookingItem(selection, baseUrl));
}

async function getBooking(auth, id, baseUrl) {
  requireId(id, 'booking');
  const selection = await EventSelection.findOne({ _id: id, ...selectedBy(auth.userId) })
    .populate(pastEventPopulation(new Date())).lean();
  if (!selection?.eventId?.hostId) throw new ServiceError(404, 'Booking not found.');
  return bookingItem(selection, baseUrl);
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

async function updateSelection(auth, eventId, body) {
  requireId(eventId, 'event');
  const changes = selectionChanges(body);
  try {
    // Index creation happens before the first upsert, outside the retryable transaction.
    await EventSelection.init();
    const event = await Event.findById(eventId).select('_id hostId');
    if (!event?.hostId) throw new ServiceError(404, 'Event not found.');
    const selection = await withActiveAccountWrite(auth, [event.hostId], async session => {
      const current = await Event.findOne({ _id: event._id, hostId: event.hostId })
        .select('_id endsAt').session(session);
      if (!current) throw new ServiceError(404, 'Event not found.');
      const endsAt = current.endsAt?.getTime();
      if (!Number.isFinite(endsAt) || endsAt <= Date.now()) {
        throw new ServiceError(409, 'This event has ended. Past selections are read-only.');
      }
      // Each flag changes independently; the owner always comes from the verified auth context.
      return EventSelection.findOneAndUpdate({ userId: auth.userId, eventId: event._id }, {
        $set: changes, $setOnInsert: { userId: auth.userId, eventId: event._id },
      }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
    });
    return selectionItem(selection);
  } catch (error) {
    if (error.code === 11000) throw new ServiceError(409, 'Your event selection changed. Please retry.');
    if (error.name === 'ValidationError') throw new ServiceError(400, 'Please check your event selection.');
    throw error;
  }
}

module.exports = { listSelections, getBookingHistory, getBooking, updateSelection };

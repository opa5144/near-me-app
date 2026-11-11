const mongoose = require('mongoose');
const Event = require('../models/Event');
const User = require('../models/User');
const { parseCreateEvent, toEventItem, EventInputError } = require('./eventData');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');

function requireEventId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id) || !mongoose.isObjectIdOrHexString(id)) {
    throw new ServiceError(400, 'Invalid event ID.');
  }
}

function eventWriteError(error) {
  if (error instanceof EventInputError) return new ServiceError(error.status, error.message);
  if (error.name === 'ValidationError') return new ServiceError(400, 'Please check your event details.');
  return error;
}

async function listPublicEvents(baseUrl) {
  // Compare full BSON instants: an ongoing event remains visible until its end time.
  const events = await Event.find({
    startsAt: { $type: 'date' },
    endsAt: { $type: 'date', $gt: new Date() },
    $expr: { $lt: ['$startsAt', '$endsAt'] },
  }).populate({
    path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null },
  }).sort({ createdAt: -1, _id: -1 }).lean();
  return events.filter(event => event.hostId).map(event => toEventItem(event, baseUrl));
}

async function listHostedEvents(auth, baseUrl) {
  // Hosts retain access to past events for management and history.
  const events = await Event.find({ hostId: auth.userId }).populate('hostId', 'firstName lastName username')
    .sort({ createdAt: -1, _id: -1 }).lean();
  return events.map(event => toEventItem(event, baseUrl));
}

async function getEventImage(id) {
  requireEventId(id);
  const event = await Event.findById(id).select('+imageData');
  if (!event || !event.imageData || !event.imageMimeType ||
      !(await User.exists({ _id: event.hostId, deletedAt: null }))) return null;
  return { data: event.imageData, mimeType: event.imageMimeType };
}

async function getEvent(id, baseUrl) {
  requireEventId(id);
  const event = await Event.findById(id).populate({
    path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null },
  }).lean();
  if (!event || !event.hostId) throw new ServiceError(404, 'Event not found.');
  return toEventItem(event, baseUrl);
}

async function createEvent(auth, body, baseUrl) {
  try {
    const fields = parseCreateEvent(body);
    // Ignore client ownership and seed keys; a verified account owns every new event.
    return await withActiveAccountWrite(auth, [], async session => {
      const [event] = await Event.create([{ ...fields, hostId: auth.userId }], { session });
      const populated = await Event.findById(event._id).session(session).populate({
        path: 'hostId', select: 'firstName lastName username', options: { session },
      }).lean();
      return toEventItem(populated, baseUrl);
    });
  } catch (error) {
    throw eventWriteError(error);
  }
}

async function updateEvent(auth, id, body, baseUrl) {
  requireEventId(id);
  try {
    const event = await Event.findById(id);
    if (!event) throw new ServiceError(404, 'Event not found.');
    if (String(event.hostId) !== String(auth.userId)) throw new ServiceError(403, 'Unauthorized to edit this event.');
    const fields = parseCreateEvent(body);
    const changes = { ...fields, hostId: auth.userId };
    if (!body.imageBase64 && !changes.imageData) {
      delete changes.imageData;
      delete changes.imageMimeType;
    }
    return await withActiveAccountWrite(auth, [event.hostId], async session => {
      // Account closure and ownership are checked again at the transactional write.
      const updated = await Event.findOneAndUpdate({ _id: id, hostId: auth.userId },
        { $set: changes }, { new: true, runValidators: true, session }).populate({
          path: 'hostId', select: 'firstName lastName username', options: { session },
        }).lean();
      if (!updated) throw new ServiceError(404, 'Event not found.');
      return toEventItem(updated, baseUrl);
    });
  } catch (error) {
    throw eventWriteError(error);
  }
}

module.exports = { listPublicEvents, listHostedEvents, getEventImage, getEvent, createEvent, updateEvent };

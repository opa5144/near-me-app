const mongoose = require('mongoose');
const Event = require('../models/Event');
const User = require('../models/User');
const { parseCreateEvent, toEventItem, EventInputError } = require('./eventData');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');
const { resolvePhotos, photoImage } = require('./photoData');

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
  return getEventPhoto(id);
}

async function getEventPhoto(id, photoId) {
  requireEventId(id);
  if (photoId !== undefined && (typeof photoId !== 'string' || !/^[a-f0-9]{24}$/i.test(photoId))) {
    throw new ServiceError(400, 'Invalid photo ID.');
  }
  const event = await Event.findById(id).select('+photos.imageData +imageData');
  if (!event || !(await User.exists({ _id: event.hostId, deletedAt: null }))) return null;
  return photoImage(event, photoId);
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
    const input = Object.prototype.hasOwnProperty.call(body, 'photos') ? body.photos
      : fields.imageData ? [{ imageBase64: body.imageBase64 }] : [];
    const photos = resolvePhotos(input, []);
    delete fields.imageData;
    delete fields.imageMimeType;
    // Ignore client ownership and seed keys; a verified account owns every new event.
    return await withActiveAccountWrite(auth, [], async session => {
      const [event] = await Event.create([{ ...fields, photos, hostId: auth.userId }], { session });
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
    const photoInput = Object.prototype.hasOwnProperty.call(body, 'photos') ? body.photos
      : fields.imageData ? [{ imageBase64: body.imageBase64 }] : undefined;
    delete fields.imageData;
    delete fields.imageMimeType;
    const changes = { ...fields, hostId: auth.userId };
    return await withActiveAccountWrite(auth, [event.hostId], async session => {
      if (photoInput !== undefined) {
        // Resolve retained IDs after locking this resource's owner; foreign-resource IDs are rejected.
        const current = await Event.findOne({ _id: id, hostId: auth.userId })
          .select('+photos.imageData +imageData').session(session);
        if (!current) throw new ServiceError(404, 'Event not found.');
        changes.photos = resolvePhotos(photoInput, current.photos ?? [],
          Array.isArray(current.photos) ? undefined : current);
      }
      // Account closure and ownership are checked again at the transactional write.
      const updated = await Event.findOneAndUpdate({ _id: id, hostId: auth.userId },
        {
          $set: changes,
          // Explicit photo edits retire the old single image, including when [] clears every photo.
          ...(photoInput !== undefined ? { $unset: { imageData: '', imageMimeType: '' } } : {}),
        }, { new: true, runValidators: true, session }).populate({
          path: 'hostId', select: 'firstName lastName username', options: { session },
        }).lean();
      if (!updated) throw new ServiceError(404, 'Event not found.');
      return toEventItem(updated, baseUrl);
    });
  } catch (error) {
    throw eventWriteError(error);
  }
}

module.exports = { listPublicEvents, listHostedEvents, getEventImage, getEventPhoto, getEvent, createEvent, updateEvent };

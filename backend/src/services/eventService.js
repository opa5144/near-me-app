const mongoose = require('mongoose');
const Event = require('../models/Event');
const User = require('../models/User');
const { parseCreateEvent, toEventItem, EventInputError } = require('./eventData');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');
const { loadPhotoMetadata, getResourcePhotoImage, replaceResourcePhotos } = require('./photoCollectionService');
const { loadEventAudienceCounts } = require('./eventAudienceService');

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

async function eventItems(events, baseUrl, session) {
  const photos = await loadPhotoMetadata('event', events.map(event => event._id), session);
  // Keep operations sequential when this helper runs inside a transaction.
  const audience = await loadEventAudienceCounts(events.map(event => event._id), session);
  return events.map(event => toEventItem(event, baseUrl, photos.get(String(event._id)) ?? [],
    audience.get(String(event._id)) ?? { interestedCount: 0, attendingCount: 0 }));
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
  return eventItems(events.filter(event => event.hostId), baseUrl);
}

async function listHostedEvents(auth, baseUrl) {
  // Hosts retain access to past events for management and history.
  const events = await Event.find({ hostId: auth.userId }).populate({
    path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null },
  })
    .sort({ createdAt: -1, _id: -1 }).lean();
  return eventItems(events.filter(event => event.hostId), baseUrl);
}

async function getEventImage(id) {
  return getEventPhoto(id);
}

async function getEventPhoto(id, photoId) {
  requireEventId(id);
  if (photoId !== undefined && (typeof photoId !== 'string' || !/^[a-f0-9]{24}$/i.test(photoId))) {
    throw new ServiceError(400, 'Invalid photo ID.');
  }
  const event = await Event.findById(id).select('_id hostId').lean();
  if (!event || !(await User.exists({ _id: event.hostId, deletedAt: null }))) return null;
  return getResourcePhotoImage('event', event._id, photoId);
}

async function getEvent(id, baseUrl) {
  requireEventId(id);
  const event = await Event.findById(id).populate({
    path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null },
  }).lean();
  if (!event || !event.hostId) throw new ServiceError(404, 'Event not found.');
  return (await eventItems([event], baseUrl))[0];
}

function eventPhotoInput(body) {
  if (Object.prototype.hasOwnProperty.call(body, 'photos')) return body.photos;
  if (body.imageBase64 !== undefined && body.imageBase64 !== null && body.imageBase64 !== '') {
    return [{ imageBase64: body.imageBase64 }];
  }
  return undefined;
}

async function createEvent(auth, body, baseUrl) {
  try {
    const fields = parseCreateEvent(body);
    const input = eventPhotoInput(body) ?? [];
    // Ignore client ownership and seed keys; a verified account owns every new event.
    return await withActiveAccountWrite(auth, [], async session => {
      const [event] = await Event.create([{ ...fields, hostId: auth.userId }], { session });
      const photos = await replaceResourcePhotos('event', event._id, input, session);
      const populated = await Event.findById(event._id).session(session).populate({
        path: 'hostId', select: 'firstName lastName username', options: { session },
      }).lean();
      return toEventItem(populated, baseUrl, photos, { interestedCount: 0, attendingCount: 0 });
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
    const photoInput = eventPhotoInput(body);
    const changes = { ...fields, hostId: auth.userId };
    return await withActiveAccountWrite(auth, [event.hostId], async session => {
      // Account closure and ownership are checked again at the transactional write.
      const updated = await Event.findOneAndUpdate({ _id: id, hostId: auth.userId },
        { $set: changes }, { new: true, runValidators: true, session }).populate({
          path: 'hostId', select: 'firstName lastName username', options: { session },
        }).lean();
      if (!updated) throw new ServiceError(404, 'Event not found.');
      if (photoInput !== undefined) {
        const photos = await replaceResourcePhotos('event', updated._id, photoInput, session);
        const audience = await loadEventAudienceCounts([updated._id], session);
        return toEventItem(updated, baseUrl, photos,
          audience.get(String(updated._id)) ?? { interestedCount: 0, attendingCount: 0 });
      }
      // Omission preserves the new collection unchanged; original media is never consulted.
      return (await eventItems([updated], baseUrl, session))[0];
    });
  } catch (error) {
    throw eventWriteError(error);
  }
}

module.exports = { listPublicEvents, listHostedEvents, getEventImage, getEventPhoto, getEvent, createEvent, updateEvent };

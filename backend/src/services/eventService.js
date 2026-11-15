const mongoose = require('mongoose');
const Event = require('../models/Event');
const User = require('../models/User');
const { parseCreateEvent, toEventItem, EventInputError } = require('./eventData');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');
const { loadPhotoMetadata, getResourcePhotoImage, replaceResourcePhotos } = require('./photoCollectionService');
const { loadEventAudienceCounts } = require('./eventAudienceService');
const { getFriendsAttendingByEvents } = require('./friendAttendance');
const { recordEventCreated, recordEventChanged, recordEventCancelled } = require('./notifications/triggerService');

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

async function eventItems(events, baseUrl, session, viewerId) {
  const photos = await loadPhotoMetadata('event', events.map(event => event._id), session);
  // Keep operations sequential when this helper runs inside a transaction.
  const audience = await loadEventAudienceCounts(events.map(event => event._id), session);
  const friends = await getFriendsAttendingByEvents(viewerId, events.map(event => event._id), baseUrl, { session });
  return events.map(event => ({
    ...toEventItem(event, baseUrl, photos.get(String(event._id)) ?? [],
      audience.get(String(event._id)) ?? { interestedCount: 0, attendingCount: 0 }),
    friendsAttending: friends.get(String(event._id)) ?? [],
  }));
}

async function listPublicEvents(baseUrl, viewerId) {
  // Compare full BSON instants: an ongoing event remains visible until its end time.
  const events = await Event.find({
    status: { $ne: 'cancelled' },
    startsAt: { $type: 'date' },
    endsAt: { $type: 'date', $gt: new Date() },
    $expr: { $lt: ['$startsAt', '$endsAt'] },
  }).populate({
    path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null },
  }).sort({ createdAt: -1, _id: -1 }).lean();
  return eventItems(events.filter(event => event.hostId), baseUrl, undefined, viewerId);
}

async function listHostedEvents(auth, baseUrl) {
  // Hosts retain access to past events for management and history.
  const events = await Event.find({ hostId: auth.userId }).populate({
    path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null },
  })
    .sort({ createdAt: -1, _id: -1 }).lean();
  return eventItems(events.filter(event => event.hostId), baseUrl, undefined, auth.userId);
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

async function getEvent(id, baseUrl, viewerId) {
  requireEventId(id);
  const event = await Event.findById(id).populate({
    path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null },
  }).lean();
  if (!event || !event.hostId) throw new ServiceError(404, 'Event not found.');
  return (await eventItems([event], baseUrl, undefined, viewerId))[0];
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
      await recordEventCreated(event.toObject(), session);
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
    return await withActiveAccountWrite(auth, [], async session => {
      // Compare the actual transactional preimage, not an earlier HTTP read.
      const before = await Event.findById(id).session(session).lean();
      if (!before) throw new ServiceError(404, 'Event not found.');
      if (String(before.hostId) !== String(auth.userId)) throw new ServiceError(403, 'Unauthorized to edit this event.');
      if (before.status === 'cancelled') throw new ServiceError(409, 'Cancelled events are read-only.');
      const fields = parseCreateEvent(body, { existingEvent: before });
      const photoInput = eventPhotoInput(body);
      const occurredAt = new Date();
      const changes = eventChanges(before, { ...before, ...fields });
      const notificationVersion = Object.keys(changes).length ? versionOf(before) + 1 : versionOf(before);
      const updated = await Event.findOneAndUpdate({ _id: id, hostId: auth.userId },
        { $set: { ...fields, notificationVersion } }, { new: true, runValidators: true, session }).lean();
      if (!updated) throw new ServiceError(404, 'Event not found.');
      if (Object.keys(changes).length) await recordEventChanged({ before, after: updated, changes, occurredAt }, session);
      await Event.populate(updated, { path: 'hostId', select: 'firstName lastName username', options: { session } });
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

function versionOf(event) {
  return Number.isSafeInteger(event.notificationVersion) && event.notificationVersion >= 0 ? event.notificationVersion : 0;
}

const iso = value => new Date(value).toISOString();
function eventChanges(before, after) {
  const changes = {};
  const schedule = event => ({ startsAt: iso(event.startsAt), endsAt: iso(event.endsAt), timeZone: event.timeZone });
  const location = event => Object.fromEntries(['place', 'address', 'placeId', 'latitude', 'longitude']
    .map(field => [field, event[field] ?? null]));
  const beforeSchedule = schedule(before);
  const afterSchedule = schedule(after);
  if (JSON.stringify(beforeSchedule) !== JSON.stringify(afterSchedule)) changes.dateTime = { before: beforeSchedule, after: afterSchedule };
  const beforeLocation = location(before);
  const afterLocation = location(after);
  if (JSON.stringify(beforeLocation) !== JSON.stringify(afterLocation)) changes.location = { before: beforeLocation, after: afterLocation };
  const beforeDeadline = iso(before.registrationClosesAt || before.startsAt);
  const afterDeadline = iso(after.registrationClosesAt || after.startsAt);
  if (beforeDeadline !== afterDeadline) changes.registrationDeadline = { before: { registrationClosesAt: beforeDeadline }, after: { registrationClosesAt: afterDeadline } };
  return changes;
}

async function cancelEvent(auth, id, body, baseUrl) {
  requireEventId(id);
  const input = body ?? {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'reason') ||
      (input.reason !== undefined && (typeof input.reason !== 'string' || input.reason.trim().length > 500))) {
    throw new ServiceError(400, 'Provide an optional cancellation reason of 500 characters or fewer.', { errors: { reason: 'Use 500 characters or fewer.' } });
  }
  return withActiveAccountWrite(auth, [], async session => {
    const before = await Event.findById(id).session(session).lean();
    if (!before) throw new ServiceError(404, 'Event not found.');
    if (String(before.hostId) !== String(auth.userId)) throw new ServiceError(403, 'Unauthorized to cancel this event.');
    if (before.status === 'cancelled') {
      await Event.populate(before, { path: 'hostId', select: 'firstName lastName username', options: { session } });
      return (await eventItems([before], baseUrl, session))[0];
    }
    const occurredAt = new Date();
    if (!Number.isFinite(new Date(before.endsAt).getTime()) || new Date(before.endsAt) <= occurredAt) {
      throw new ServiceError(409, 'Ended events cannot be cancelled.');
    }
    const after = await Event.findOneAndUpdate({ _id: id, hostId: auth.userId }, { $set: {
      status: 'cancelled', cancelledAt: occurredAt, cancellationReason: input.reason?.trim() || '',
      notificationVersion: versionOf(before) + 1,
    } }, { new: true, runValidators: true, session }).lean();
    if (!after) throw new ServiceError(404, 'Event not found.');
    await recordEventCancelled({ before, after, occurredAt }, session);
    await Event.populate(after, { path: 'hostId', select: 'firstName lastName username', options: { session } });
    return (await eventItems([after], baseUrl, session))[0];
  });
}

module.exports = { listPublicEvents, listHostedEvents, getEventImage, getEventPhoto, getEvent, createEvent, updateEvent, cancelEvent };

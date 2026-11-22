const mongoose = require('mongoose');
const Event = require('../models/Event');
const { findEventById, findEvents } = require('../models/eventStore');
const { archivePublishedEvent } = require('./eventDraftService');
const User = require('../models/User');
const { parseCreateEvent, toEventItem, EventInputError } = require('./eventData');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');
const { loadPhotoMetadata, getResourcePhotoImage, replaceResourcePhotos } = require('./photoCollectionService');
const { loadEventAudienceCounts } = require('./eventAudienceService');
const { getFriendsAttendingByEvents } = require('./friendAttendance');
const { loadTicketModeLocks, validateTicketModeChange, updateEventTickets } = require('./ticketService');
const { requireTicketConfiguration } = require('./ticketCredentials');
const { recordEventCreated, recordEventChanged } = require('./notifications/triggerService');

function requireEventId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id) || !mongoose.isObjectIdOrHexString(id)) {
    throw new ServiceError(400, 'Invalid event ID.');
  }
}

function eventWriteError(error) {
  if (error instanceof EventInputError) return new ServiceError(error.status, error.message, { errors: error.errors });
  if (error.name === 'ValidationError') return new ServiceError(400, 'Please check your event details.');
  return error;
}

async function eventItems(events, baseUrl, session, viewerId) {
  const photos = await loadPhotoMetadata('event', events.map(event => event._id), session);
  // Keep operations sequential when this helper runs inside a transaction.
  const audience = await loadEventAudienceCounts(events.map(event => event._id), session);
  const friends = await getFriendsAttendingByEvents(viewerId, events.map(event => event._id), baseUrl, { session });
  const locked = await loadTicketModeLocks(events.map(event => event._id), session);
  return events.map(event => ({
    ...toEventItem({ ...event, ticketsModeLocked: locked.has(String(event._id)) }, baseUrl, photos.get(String(event._id)) ?? [],
      audience.get(String(event._id)) ?? { interestedCount: 0, attendingCount: 0 }),
    friendsAttending: friends.get(String(event._id)) ?? [],
  }));
}

async function listPublicEvents(baseUrl, viewerId) {
  // Compare full BSON instants: an ongoing event remains visible until its end time.
  const events = await Event.find({
    status: { $nin: ['cancelled', 'archived', 'draft'] },
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
  const events = await findEvents({ hostId: auth.userId }, { populate: {
    path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null },
  } });
  events.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt) || String(right._id).localeCompare(String(left._id)));
  return eventItems(events.filter(event => event.hostId), baseUrl, undefined, auth.userId);
}

async function getEventImage(id, viewerId) {
  return getEventPhoto(id, undefined, viewerId);
}

async function getEventPhoto(id, photoId, viewerId) {
  requireEventId(id);
  if (photoId !== undefined && (typeof photoId !== 'string' || !/^[a-f0-9]{24}$/i.test(photoId))) {
    throw new ServiceError(400, 'Invalid photo ID.');
  }
  const event = await findEventById(id, { select: '_id hostId status' });
  if (!event || !(await User.exists({ _id: event.hostId, deletedAt: null }))) return null;
  if (event.status === 'draft' && String(event.hostId) !== String(viewerId)) return null;
  return getResourcePhotoImage('event', event._id, photoId);
}

async function getEvent(id, baseUrl, viewerId) {
  requireEventId(id);
  const event = await findEventById(id, { populate: {
    path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null },
  } });
  if (!event || !event.hostId) throw new ServiceError(404, 'Event not found.');
  if (event.status === 'draft' && String(event.hostId._id) !== String(viewerId)) throw new ServiceError(404, 'Event not found.');
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
    if (fields.useTickets) requireTicketConfiguration();
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
      if (!before) {
        const historical = await findEventById(id, { session });
        if (historical && String(historical.hostId) === String(auth.userId)) throw new ServiceError(409, 'This event is read-only. Reschedule a completed event to create a new occurrence.');
        throw new ServiceError(404, 'Event not found.');
      }
      if (String(before.hostId) !== String(auth.userId)) throw new ServiceError(403, 'Unauthorized to edit this event.');
      if (['cancelled', 'archived', 'draft'].includes(before.status) || new Date(before.endsAt).getTime() <= Date.now()) throw new ServiceError(409, 'This event is read-only. Reschedule a completed event to create a new occurrence.');
      const fields = parseCreateEvent(body, { existingEvent: before });
      const ticketsModeLocked = await validateTicketModeChange(before, fields, session);
      const photoInput = eventPhotoInput(body);
      const occurredAt = new Date();
      const changes = eventChanges(before, { ...before, ...fields });
      const notificationVersion = Object.keys(changes).length ? versionOf(before) + 1 : versionOf(before);
      const updated = await Event.findOneAndUpdate({ _id: id, hostId: auth.userId },
        { $set: { ...fields, notificationVersion } }, { new: true, runValidators: true, session }).lean();
      if (!updated) throw new ServiceError(404, 'Event not found.');
      await updateEventTickets(updated, session);
      if (Object.keys(changes).length) await recordEventChanged({ before, after: updated, changes, occurredAt }, session);
      await Event.populate(updated, { path: 'hostId', select: 'firstName lastName username', options: { session } });
      if (photoInput !== undefined) {
        const photos = await replaceResourcePhotos('event', updated._id, photoInput, session);
        const audience = await loadEventAudienceCounts([updated._id], session);
        return toEventItem({ ...updated, ticketsModeLocked }, baseUrl, photos,
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
  const beforeDeadline = iso(before.registrationClosesAt || before.endsAt);
  const afterDeadline = iso(after.registrationClosesAt || after.endsAt);
  if (beforeDeadline !== afterDeadline) changes.registrationDeadline = { before: { registrationClosesAt: beforeDeadline }, after: { registrationClosesAt: afterDeadline } };
  return changes;
}

async function cancelEvent(auth, id, body, baseUrl) {
  return archivePublishedEvent(auth, id, body, baseUrl, 'cancelled');
}

module.exports = { listPublicEvents, listHostedEvents, getEventImage, getEventPhoto, getEvent, createEvent, updateEvent, cancelEvent };

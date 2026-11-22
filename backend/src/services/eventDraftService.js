const Event = require('../models/Event');
const ArchivedEvent = require('../models/ArchivedEvent');
const { findEventById, relocateEvent } = require('../models/eventStore');
const { parseCreateEvent, parseDraftEvent, toEventItem, EventInputError } = require('./eventData');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');
const { replaceResourcePhotos, loadPhotoMetadata, copyResourcePhotos } = require('./photoCollectionService');
const { loadEventAudienceCounts } = require('./eventAudienceService');
const { recordEventCreated, recordEventCancelled } = require('./notifications/triggerService');
const { loadTicketModeLocks, updateEventTickets } = require('./ticketService');
const { requireTicketConfiguration } = require('./ticketCredentials');

function requireId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw new ServiceError(400, 'Invalid event ID.');
}

function owner(event, auth) {
  if (!event) throw new ServiceError(404, 'Event not found.');
  if (String(event.hostId) !== String(auth.userId)) throw new ServiceError(403, 'Only the host can manage this event.');
}

async function response(event, baseUrl, session) {
  await Event.populate(event, { path: 'hostId', select: 'firstName lastName username', options: { session } });
  const photos = await loadPhotoMetadata('event', [event._id], session);
  const counts = await loadEventAudienceCounts([event._id], session);
  const locked = await loadTicketModeLocks([event._id], session);
  return toEventItem({ ...event, ticketsModeLocked: locked.has(String(event._id)) }, baseUrl, photos.get(String(event._id)) || [], counts.get(String(event._id)) || { interestedCount: 0, attendingCount: 0, checkedInCount: 0 });
}

async function validation(write) {
  try { return await write(); }
  catch (error) {
    if (error instanceof EventInputError) throw new ServiceError(error.status, error.message, { errors: error.errors });
    if (error.name === 'ValidationError') throw new ServiceError(400, 'Please check your event details.');
    throw error;
  }
}

async function saveDraft(auth, id, body, baseUrl) {
  if (id) requireId(id);
  return validation(async () => {
    const fields = parseDraftEvent(body);
    return withActiveAccountWrite(auth, [], async session => {
      let event;
      if (id) {
        const before = await findEventById(id, { session });
        owner(before, auth);
        if (before.status !== 'draft') throw new ServiceError(409, 'Only drafts can be saved as a draft.');
        const updated = await ArchivedEvent.findOne({ _id: id, hostId: auth.userId, status: 'draft' }).session(session);
        if (!updated) throw new ServiceError(409, 'This draft changed. Please reload it.');
        updated.set(fields);
        await updated.save({ session });
        event = { ...updated.toObject(), storage: 'archived' };
      } else {
        const [created] = await ArchivedEvent.create([{ ...fields, hostId: auth.userId, status: 'draft' }], { session });
        event = { ...created.toObject(), storage: 'archived' };
      }
      if (Object.prototype.hasOwnProperty.call(body, 'photos')) await replaceResourcePhotos('event', event._id, body.photos, session);
      return response(event, baseUrl, session);
    });
  });
}

async function publishDraft(auth, id, body, baseUrl) {
  requireId(id);
  return validation(() => withActiveAccountWrite(auth, [], async session => {
    const before = await findEventById(id, { session });
    owner(before, auth);
    if (before.status !== 'draft') throw new ServiceError(409, 'Only a draft can be published.');
    const fields = parseCreateEvent(body, { existingEvent: before });
    if (fields.useTickets) requireTicketConfiguration();
    const now = new Date();
    const event = await relocateEvent(before, 'current', session, {
      ...fields, status: 'published', archivedAt: null, archiveReason: '', updatedAt: now,
    });
    if (Object.prototype.hasOwnProperty.call(body, 'photos')) await replaceResourcePhotos('event', id, body.photos, session);
    await recordEventCreated({ ...event, createdAt: now }, session);
    return response(event, baseUrl, session);
  }));
}

async function archivePublishedEvent(auth, id, body, baseUrl, status = 'archived') {
  requireId(id);
  const input = body ?? {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'reason') ||
      (input.reason !== undefined && (typeof input.reason !== 'string' || input.reason.trim().length > 500))) {
    throw new ServiceError(400, 'Provide an optional reason of 500 characters or fewer.', { errors: { reason: 'Use 500 characters or fewer.' } });
  }
  return withActiveAccountWrite(auth, [], async session => {
    const before = await findEventById(id, { session });
    owner(before, auth);
    if (before.status === status || ['cancelled', 'archived'].includes(before.status)) return response(before, baseUrl, session);
    if (before.status === 'draft') throw new ServiceError(409, 'This event is already a private draft.');
    const now = new Date();
    const ongoingOrUpcoming = new Date(before.endsAt).getTime() > now.getTime();
    if (!ongoingOrUpcoming) throw new ServiceError(409, 'Completed events remain in history. Reschedule to create a new occurrence.');
    const after = await relocateEvent(before, 'archived', session, {
      status, archivedAt: now, archiveReason: input.reason?.trim() || '', updatedAt: now,
      ...(ongoingOrUpcoming ? { cancelledAt: now, cancellationReason: input.reason?.trim() || '' } : {}),
      notificationVersion: (Number.isSafeInteger(before.notificationVersion) ? before.notificationVersion : 0) + 1,
    });
    await updateEventTickets(after, session);
    if (ongoingOrUpcoming) await recordEventCancelled({ before, after, occurredAt: now }, session);
    return response(after, baseUrl, session);
  });
}

async function rescheduleEvent(auth, id, body, baseUrl) {
  requireId(id);
  return validation(() => withActiveAccountWrite(auth, [], async session => {
    const source = await findEventById(id, { session });
    owner(source, auth);
    const endedAt = source.endsAt == null ? NaN : new Date(source.endsAt).getTime();
    const startedAt = source.startsAt == null ? NaN : new Date(source.startsAt).getTime();
    if ((source.status || 'published') !== 'published' || !Number.isFinite(endedAt) ||
        !Number.isFinite(startedAt) || startedAt >= endedAt || endedAt > Date.now()) {
      throw new ServiceError(409, 'Only a completed event can be rescheduled as a new event.');
    }
    const fields = parseCreateEvent(body);
    if (fields.useTickets) requireTicketConfiguration();
    const [created] = await Event.create([{ ...fields, hostId: auth.userId, sourceEventId: source._id }], { session });
    const event = { ...created.toObject(), storage: 'current' };
    await copyResourcePhotos('event', source._id, event._id, session,
      Object.prototype.hasOwnProperty.call(body, 'photos') ? body.photos : undefined);
    await recordEventCreated(event, session);
    return response(event, baseUrl, session);
  }));
}

module.exports = { saveDraft, publishDraft, archivePublishedEvent, rescheduleEvent };

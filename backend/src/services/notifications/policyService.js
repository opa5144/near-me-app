const User = require('../../models/User');
const Event = require('../../models/Event');
const EventSelection = require('../../models/EventSelection');
const EventRating = require('../../models/EventRating');
const EventInvite = require('../../models/EventInvite');
const Friendship = require('../../models/Friendship');
const { versionOf, requestedAt } = require('./friendRequestService');
const { areAcceptedFriends } = require('../friendshipAccess');
const OrganizerFollow = require('../../models/OrganizerFollow');
const { NOTIFICATION_TYPES, TIMED_TYPES } = require('../../constants/notificationTypes');
const { getNotificationConfig } = require('../../config/notifications');
const { readPreferences, resolveChannels } = require('./preferenceService');
const { notificationOccurrence } = require('./timing');
const { ratingEligibility } = require('../eventRatingService');

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const instant = value => value == null ? NaN : new Date(value).getTime();
const version = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;

function payloadFor(job) {
  const payload = object(job.payload);
  return { ...object(payload.context), ...payload };
}

function sameInstant(expected, actual) {
  return Number.isFinite(instant(expected)) && instant(expected) === instant(actual);
}

function sameVersion(expected, actual) {
  return Number.isSafeInteger(expected) && expected >= 0 && expected === version(actual);
}

async function read(query, session) {
  if (session) query.session(session);
  return query.lean();
}

// Eligibility reads have no side effects. Call again within the inbox transaction
// and immediately before a provider send, since choices/schedules may have changed.
async function loadNotificationContext(job, now = new Date(), { session } = {}) {
  if (!job?.userId || !NOTIFICATION_TYPES.includes(job.type)) return null;
  const currentTime = instant(now);
  if (!Number.isFinite(currentTime)) return null;
  const payload = payloadFor(job);
  const user = await read(User.findOne({ _id: job.userId, deletedAt: null })
    .select('_id firstName username'), session);
  if (!user) return null;
  if (job.type === 'FRIEND_REQUEST') {
    if (typeof payload.requestId !== 'string' || !/^[a-f0-9]{24}$/i.test(payload.requestId) || !job.actorId) return null;
    const request = await read(Friendship.findOne({ _id: payload.requestId, recipient: user._id,
      requester: job.actorId, status: 'pending' }), session);
    if (!request || payload.requestVersion !== versionOf(request) ||
        !sameInstant(payload.requestedAt, requestedAt(request)) || instant(requestedAt(request)) > currentTime) return null;
    const sender = await read(User.findOne({ _id: request.requester, deletedAt: null })
      .select('_id firstName lastName username'), session);
    if (!sender) return null;
    const conflicting = Friendship.exists({ status: { $in: ['blocked', 'accepted'] }, $or: [
      { requester: user._id, recipient: sender._id }, { requester: sender._id, recipient: user._id },
    ] });
    if (session) conflicting.session(session);
    if (await conflicting) return null;
    return { job, payload, user, sender, request, event: null, host: null, eventSnapshot: null };
  }
  if (!job.eventId) return null;
  const event = await read(Event.findById(job.eventId), session);
  if (!event?.hostId) return null;
  const host = await read(User.findOne({ _id: event.hostId, deletedAt: null })
    .select('_id firstName lastName username'), session);
  if (!host) return null;
  const selection = await read(EventSelection.findOne({ userId: user._id, eventId: event._id }), session);
  const selected = Boolean(selection?.interested || selection?.attending);
  const cancelled = event.status === 'cancelled';
  let follow = null;
  let sender = null;

  if (TIMED_TYPES.includes(job.type)) {
    const due = instant(notificationOccurrence(job));
    const expiry = job.expiresAt == null ? due + getNotificationConfig().graceMs : instant(job.expiresAt);
    if (!Number.isFinite(due) || !Number.isFinite(expiry) || currentTime < due || currentTime > expiry || cancelled) return null;
    if (!sameVersion(payload.eventVersion, event.notificationVersion) ||
        !sameVersion(payload.registrationVersion, selection?.registrationVersion)) return null;
    if (job.type === 'SAVED_EVENT_REGISTRATION_CLOSING') {
      const closesAt = event.registrationClosesAt ?? event.startsAt;
      if (!selection?.interested || selection.attending || currentTime >= instant(closesAt) ||
          !sameInstant(payload.expectedClosesAt, closesAt) ||
          !sameVersion(payload.selectionVersion, selection.selectionVersion)) return null;
    } else if (job.type === 'RATE_ATTENDED_EVENT') {
      if (!sameInstant(payload.expectedEndsAt, event.endsAt) || !ratingEligibility(event, selection, user._id, now).canRate) return null;
      const existingRating = EventRating.exists({ userId: user._id, eventId: event._id });
      if (session) existingRating.session(session);
      if (await existingRating) return null;
    } else if (!selection?.attending || !sameInstant(payload.expectedStartsAt, event.startsAt) || currentTime >= instant(event.startsAt)) {
      return null;
    }
  } else if (job.type === 'EVENT_INVITE') {
    if (cancelled || currentTime >= instant(event.registrationClosesAt || event.startsAt) ||
        typeof payload.inviteId !== 'string' || !/^[a-f0-9]{24}$/i.test(payload.inviteId)) return null;
    const invite = await read(EventInvite.findOne({ _id: payload.inviteId, eventId: event._id,
      recipientId: user._id, senderId: job.actorId, status: 'pending', read: { $ne: true } }), session);
    if (!invite) return null;
    sender = await read(User.findOne({ _id: invite.senderId, deletedAt: null }).select('_id username'), session);
    if (!sender || !(await areAcceptedFriends(sender._id, user._id, { session }))) return null;
  } else if (job.type === 'REGISTRATION_CONFIRMED' || job.type === 'REGISTRATION_CANCELLED') {
    // These are committed facts, not assertions of the user's latest status. A
    // later register/cancel cycle must not erase an earlier confirmation/history.
    if (!selection || (payload.registrationVersion !== undefined &&
        version(payload.registrationVersion) > version(selection.registrationVersion))) return null;
  } else if (job.type === 'FOLLOWED_ORGANIZER_NEW_EVENT') {
    if (cancelled || currentTime >= instant(event.endsAt) || String(user._id) === String(host._id)) return null;
    follow = await read(OrganizerFollow.findOne({ userId: user._id, organizerId: host._id, active: true }), session);
    const occurredAt = instant(payload.occurredAt ?? job.createdAt);
    if (!follow || !Number.isFinite(occurredAt) || instant(follow.followedAt) > occurredAt) return null;
  } else if (!selected) {
    // Changes/cancellation go to current registered and saved audiences, once per user.
    return null;
  }

  const eventSnapshot = object(payload.eventSnapshot);
  return { job, payload, user, event, host, selection, follow, sender,
    eventSnapshot: Object.keys(eventSnapshot).length ? eventSnapshot : event };
}

async function allowedChannels(userId, type, { session } = {}) {
  if (!NOTIFICATION_TYPES.includes(type)) return [];
  return resolveChannels(await readPreferences(userId, { session }), type);
}

module.exports = { loadNotificationContext, allowedChannels };

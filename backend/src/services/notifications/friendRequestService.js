const Notification = require('../../models/Notification');
const { enqueueJob } = require('./triggerService');
const { notificationKey } = require('./keys');

const versionOf = request => Number.isSafeInteger(request.requestVersion) && request.requestVersion >= 1 ? request.requestVersion : 1;
const requestedAt = request => new Date(request.requestedAt || request.createdAt);

// Legacy pending relationships are generation one. A resend gets a new key,
// whereas repeated taps/backfills of the same pending request remain one alert.
function friendRequestJob(request) {
  const occurredAt = requestedAt(request);
  if (!Number.isFinite(occurredAt.getTime())) throw new Error('Friend request has no valid occurrence.');
  return {
    key: notificationKey('friendRequest', request._id, versionOf(request)), kind: 'notification', type: 'FRIEND_REQUEST',
    userId: request.recipient, actorId: request.requester, dueAt: occurredAt,
    payload: { requestId: String(request._id), requestVersion: versionOf(request),
      requestedAt: occurredAt.toISOString(), occurredAt: occurredAt.toISOString() },
  };
}

async function enqueueFriendRequest(request, session) {
  if (request.status !== 'pending') return;
  return enqueueJob(session, friendRequestJob(request));
}

async function markFriendRequestRead(requestId, session) {
  return Notification.updateMany({ type: 'FRIEND_REQUEST', $or: [
    { requestId }, { 'data.requestId': String(requestId) },
  ] }, { $set: { isRead: true, readAt: new Date() } }, { session });
}

module.exports = { versionOf, requestedAt, friendRequestJob, enqueueFriendRequest, markFriendRequestRead };

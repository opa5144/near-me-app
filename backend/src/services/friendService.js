const mongoose = require('mongoose');
const Friendship = require('../models/Friendship');
const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  return err;
}

async function fetchFriendsNetwork(accountId, publicApiBaseUrl) {
  try {
    if (!accountId) {
      return { friends: [], pendingRequests: [], sentRequests: [] };
    }

    const userId = String(accountId);

    // Accepted friends
    const friendships = await Friendship.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: 'accepted',
    }).populate({
      path: 'requester recipient',
      select: '_id firstName lastName username deletedAt',
    });

    // Incoming pending requests
    const pendingRequestsRaw = await Friendship.find({
      recipient: userId,
      status: 'pending',
    }).populate({
      path: 'requester',
      select: '_id firstName lastName username deletedAt',
    });

    // Outgoing pending requests
    const sentRequestsRaw = await Friendship.find({
      requester: userId,
      status: 'pending',
    }).populate({
      path: 'recipient',
      select: '_id firstName lastName username deletedAt',
    });

    const friendAccounts = (friendships || [])
      .filter(f => f && f.requester && f.recipient && !f.requester.deletedAt && !f.recipient.deletedAt)
      .map(f => (String(f.requester._id) === userId ? f.recipient : f.requester));

    const incoming = (pendingRequestsRaw || []).filter(
      r => r && r.requester && !r.requester.deletedAt
    );

    const outgoing = (sentRequestsRaw || []).filter(
      r => r && r.recipient && !r.recipient.deletedAt
    );

    const avatarIds = [
      ...new Set([
        ...friendAccounts.map(f => String(f._id)),
        ...incoming.map(r => String(r.requester._id)),
        ...outgoing.map(r => String(r.recipient._id)),
      ]),
    ];

    const avatarUrls =
      avatarIds.length > 0 && typeof avatarUrlsForUsers === 'function'
        ? await avatarUrlsForUsers(avatarIds, publicApiBaseUrl)
        : new Map();

    const friends = friendAccounts.map(friend => ({
      id: friend._id,
      name: `${friend.firstName || ''} ${friend.lastName || ''}`.trim() || friend.username,
      username: friend.username,
      avatar: avatarUrls.get(String(friend._id)) || DEFAULT_AVATAR,
    }));

    const pendingRequests = incoming.map(request => ({
      requestId: request._id,
      id: request.requester._id,
      name: `${request.requester.firstName || ''} ${request.requester.lastName || ''}`.trim() || request.requester.username,
      username: request.requester.username,
      avatar: avatarUrls.get(String(request.requester._id)) || DEFAULT_AVATAR,
    }));

    const sentRequests = outgoing.map(request => ({
      requestId: request._id,
      id: request.recipient._id,
      name: `${request.recipient.firstName || ''} ${request.recipient.lastName || ''}`.trim() || request.recipient.username,
      username: request.recipient.username,
      avatar: avatarUrls.get(String(request.recipient._id)) || DEFAULT_AVATAR,
    }));

    return { friends, pendingRequests, sentRequests };
  } catch (error) {
    console.error('[fetchFriendsNetwork] 500 Error:', error);
    throw error;
  }
}

async function createFriendRequest(authContext, body = {}) {
  const userId = String(authContext?.userId || authContext || '');
  const recipientId = String(body?.recipientId || '');

  if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(recipientId)) {
    throw createHttpError(400, 'Invalid user ID');
  }

  if (userId === recipientId) {
    throw createHttpError(400, 'You cannot send a friend request to yourself');
  }

  const existing = await Friendship.findOne({
    $or: [
      { requester: userId, recipient: recipientId },
      { requester: recipientId, recipient: userId },
    ],
  });

  if (existing) {
    if (existing.status === 'accepted') {
      throw createHttpError(409, 'You are already friends');
    }
    if (existing.status === 'pending') {
      if (String(existing.recipient) === userId) {
        existing.status = 'accepted';
        await existing.save();
        return existing;
      }
      throw createHttpError(409, 'Friend request already sent');
    }
    if (existing.status === 'rejected') {
      existing.requester = userId;
      existing.recipient = recipientId;
      existing.status = 'pending';
      await existing.save();
      return existing;
    }
  }

  const friendship = await Friendship.create({
    requester: userId,
    recipient: recipientId,
    status: 'pending',
  });

  return friendship;
}

async function respondToFriendRequest(authContext, requestId, body = {}) {
  const userId = String(authContext?.userId || authContext || '');
  const action = body?.action;

  if (!mongoose.Types.ObjectId.isValid(requestId)) {
    throw createHttpError(400, 'Invalid request ID');
  }

  if (action !== 'accept' && action !== 'reject') {
    throw createHttpError(400, 'Action must be "accept" or "reject"');
  }

  const friendship = await Friendship.findById(requestId);
  if (!friendship) {
    throw createHttpError(404, 'Friend request not found');
  }

  if (String(friendship.recipient) !== userId) {
    throw createHttpError(403, 'You are not authorized to respond to this request');
  }

  if (friendship.status !== 'pending') {
    throw createHttpError(409, `Friend request is already ${friendship.status}`);
  }

  friendship.status = action === 'accept' ? 'accepted' : 'rejected';
  await friendship.save();

  return friendship;
}

module.exports = {
  fetchFriendsNetwork,
  createFriendRequest,
  respondToFriendRequest,
};
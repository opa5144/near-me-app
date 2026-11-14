const Friendship = require('../models/Friendship'); // Adjust path to your Friendship model if necessary
const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

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

    // Filter out null references or soft-deleted accounts safely in JS
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

    // Guard against calling avatarUrlsForUsers with an empty array
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
    }));

    return { friends, pendingRequests, sentRequests };
  } catch (error) {
    console.error('[fetchFriendsNetwork] 500 Error:', error);
    throw error;
  }
}
module.exports = {
  fetchFriendsNetwork,
};
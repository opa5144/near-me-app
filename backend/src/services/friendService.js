const Friendship = require('../models/Friendship');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');

const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

async function fetchFriendsNetwork(accountId) {
  const userId = String(accountId);
  const friendships = await Friendship.find({
    $or: [{ requester: userId }, { recipient: userId }],
    status: 'accepted',
  }).populate({
    path: 'requester recipient',
    select: '_id firstName lastName username avatarUrl',
    match: { deletedAt: null },
  });

  // Retain archived relationships, but omit an unavailable account from the network.
  const friends = friendships.filter(friendship => friendship.requester && friendship.recipient).map(friendship => {
    const friend = friendship.requester._id.toString() === userId ? friendship.recipient : friendship.requester;
    return {
      id: friend._id,
      name: `${friend.firstName || ''} ${friend.lastName || ''}`.trim() || friend.username,
      username: friend.username,
      avatar: friend.avatarUrl || DEFAULT_AVATAR,
    };
  });

  const pendingRequestsRaw = await Friendship.find({ recipient: userId, status: 'pending' }).populate({
    path: 'requester',
    select: '_id firstName lastName username avatarUrl',
    match: { deletedAt: null },
  });
  const pendingRequests = pendingRequestsRaw.filter(request => request.requester).map(request => ({
    requestId: request._id,
    id: request.requester._id,
    name: `${request.requester.firstName || ''} ${request.requester.lastName || ''}`.trim() || request.requester.username,
    username: request.requester.username,
    avatar: request.requester.avatarUrl || DEFAULT_AVATAR,
  }));

  return { friends, pendingRequests };
}

async function createFriendRequest(auth, input) {
  const { recipientId } = input;
  const requesterId = auth.userId;
  if (typeof recipientId !== 'string' || !/^[a-f0-9]{24}$/i.test(recipientId)) {
    throw new ServiceError(404, 'This account is unavailable.');
  }
  if (recipientId.toLowerCase() === String(requesterId).toLowerCase()) {
    throw new ServiceError(400, 'You cannot send a friend request to yourself.');
  }

  return withActiveAccountWrite(auth, [recipientId], async session => {
    const existing = await Friendship.findOne({
      $or: [
        { requester: requesterId, recipient: recipientId },
        { requester: recipientId, recipient: requesterId },
      ],
    }).session(session);
    if (existing) throw new ServiceError(400, 'Relationship or request already exists.');

    const [friendship] = await Friendship.create([{ requester: requesterId, recipient: recipientId }], { session });
    return friendship;
  });
}

async function respondToFriendRequest(auth, requestId, input) {
  const { action } = input;
  if (action !== 'accept' && action !== 'reject') {
    throw new ServiceError(400, 'Choose accept or reject.');
  }
  const status = action === 'accept' ? 'accepted' : 'rejected';
  const pending = await Friendship.findOne({ _id: requestId, recipient: auth.userId, status: 'pending' });
  if (!pending) throw new ServiceError(404, 'Friend request not found or already processed.');

  // Fence both accounts and recheck pending ownership in the same transaction.
  return withActiveAccountWrite(auth, [pending.requester], async session => {
    const friendship = await Friendship.findOneAndUpdate(
      { _id: pending._id, requester: pending.requester, recipient: auth.userId, status: 'pending' },
      { $set: { status } },
      { new: true, session }
    );
    if (!friendship) throw new ServiceError(404, 'Friend request not found or already processed.');
    return friendship;
  });
}

module.exports = { fetchFriendsNetwork, createFriendRequest, respondToFriendRequest };

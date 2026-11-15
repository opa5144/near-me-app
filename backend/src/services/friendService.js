const Friendship = require('../models/Friendship');
const User = require('../models/User');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');
const { avatarUrlsForUsers } = require('./accountReadService');

const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

function objectId(value, status, message) {
  if (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value)) {
    throw new ServiceError(status, message);
  }
  return value.toLowerCase();
}

function pairFilter(userId, otherId) {
  return { $or: [
    { requester: userId, recipient: otherId },
    { requester: otherId, recipient: userId },
  ] };
}

async function fetchFriendsNetwork(accountId, publicApiBaseUrl) {
  const userId = objectId(String(accountId || ''), 401, 'Please log in again.');
  if (!(await User.exists({ _id: userId, deletedAt: null }))) {
    throw new ServiceError(401, 'Please log in again.');
  }
  const friendships = await Friendship.find({
    $or: [{ requester: userId }, { recipient: userId }], status: 'accepted',
  }).populate({
    path: 'requester recipient', select: '_id firstName lastName username', match: { deletedAt: null },
  });
  const incoming = (await Friendship.find({ recipient: userId, status: 'pending' }).populate({
    path: 'requester', select: '_id firstName lastName username', match: { deletedAt: null },
  })).filter(request => request.requester);
  const outgoing = (await Friendship.find({ requester: userId, status: 'pending' }).populate({
    path: 'recipient', select: '_id firstName lastName username', match: { deletedAt: null },
  })).filter(request => request.recipient);
  const friendAccounts = friendships.filter(friendship => friendship.requester && friendship.recipient)
    .map(friendship => String(friendship.requester._id) === userId ? friendship.recipient : friendship.requester);
  const avatarUrls = await avatarUrlsForUsers([
    ...friendAccounts.map(friend => friend._id),
    ...incoming.map(request => request.requester._id),
    ...outgoing.map(request => request.recipient._id),
  ], publicApiBaseUrl);
  const summary = account => ({
    id: account._id,
    name: `${account.firstName || ''} ${account.lastName || ''}`.trim() || account.username,
    username: account.username,
    avatar: avatarUrls.get(String(account._id)) || DEFAULT_AVATAR,
  });
  const friends = [...new Map(friendAccounts.map(friend => [String(friend._id), summary(friend)])).values()];
  const pendingRequests = incoming.map(request => ({ requestId: request._id, ...summary(request.requester) }));
  const sentRequests = outgoing.map(request => ({ requestId: request._id, ...summary(request.recipient) }));
  return { friends, pendingRequests, sentRequests };
}

async function createFriendRequest(auth, input) {
  const userId = objectId(String(auth.userId || ''), 401, 'Please log in again.');
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => key !== 'recipientId')) {
    throw new ServiceError(400, 'Provide a recipientId.');
  }
  const recipientId = objectId(input.recipientId, 404, 'This account is unavailable.');
  if (userId === recipientId) throw new ServiceError(400, 'You cannot send a friend request to yourself.');
  await Friendship.init();

  // Both account fences serialize crossed requests and prevent writes after closure.
  return withActiveAccountWrite(auth, [recipientId], async session => {
    const relationships = await Friendship.find(pairFilter(userId, recipientId)).sort({ createdAt: 1, _id: 1 }).session(session);
    if (relationships.some(relationship => relationship.status === 'blocked')) {
      throw new ServiceError(403, 'This friendship is unavailable.');
    }
    const accepted = relationships.find(relationship => relationship.status === 'accepted');
    if (accepted) return accepted;
    const incoming = relationships.find(relationship => relationship.status === 'pending' && String(relationship.recipient) === userId);
    if (incoming) {
      incoming.status = 'accepted';
      await incoming.save({ session });
      return incoming;
    }
    const pending = relationships.find(relationship => relationship.status === 'pending');
    if (pending) return pending;
    const rejected = relationships.find(relationship => relationship.status === 'rejected' && String(relationship.requester) === userId) ||
      relationships.find(relationship => relationship.status === 'rejected');
    if (rejected) {
      rejected.requester = userId;
      rejected.recipient = recipientId;
      rejected.status = 'pending';
      await rejected.save({ session });
      return rejected;
    }
    const [friendship] = await Friendship.create([{ requester: userId, recipient: recipientId, status: 'pending' }], { session });
    return friendship;
  });
}

async function respondToFriendRequest(auth, requestId, input) {
  const userId = objectId(String(auth.userId || ''), 401, 'Please log in again.');
  const id = objectId(requestId, 400, 'Invalid request ID.');
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => key !== 'action') || !['accept', 'reject'].includes(input.action)) {
    throw new ServiceError(400, 'Choose accept or reject.');
  }
  const existing = await Friendship.findById(id).select('requester recipient').lean();
  if (!existing) throw new ServiceError(404, 'Friend request not found.');
  if (String(existing.recipient) !== userId) {
    throw new ServiceError(403, 'You are not authorized to respond to this request.');
  }
  const status = input.action === 'accept' ? 'accepted' : 'rejected';
  return withActiveAccountWrite(auth, [existing.requester], async session => {
    const friendship = await Friendship.findOne({ _id: id, requester: existing.requester, recipient: userId }).session(session);
    if (!friendship) throw new ServiceError(404, 'Friend request not found.');
    const blocked = await Friendship.exists({ ...pairFilter(userId, String(existing.requester)), status: 'blocked' }).session(session);
    if (blocked) throw new ServiceError(403, 'This friendship is unavailable.');
    if (friendship.status === status) return friendship;
    if (friendship.status !== 'pending') {
      throw new ServiceError(409, `Friend request is already ${friendship.status}.`);
    }
    const updated = await Friendship.findOneAndUpdate({ _id: id, requester: existing.requester, recipient: userId, status: 'pending' },
      { $set: { status } }, { new: true, runValidators: true, session });
    if (!updated) throw new ServiceError(409, 'Friend request has already been processed.');
    return updated;
  });
}

module.exports = { fetchFriendsNetwork, createFriendRequest, respondToFriendRequest };

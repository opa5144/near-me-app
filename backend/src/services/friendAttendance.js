const Friendship = require('../models/Friendship');
const EventSelection = require('../models/EventSelection');
const User = require('../models/User');
const { avatarUrlsForUsers } = require('./accountReadService');

const DEFAULT_AVATAR = 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

// Only the verified viewer's active friends are included in event responses.
async function getFriendsAttendingByEvents(viewerId, eventIds, baseUrl, { session } = {}) {
  const result = new Map();
  if (!viewerId || !eventIds?.length) return result;
  const userId = String(viewerId);
  if (!(await User.exists({ _id: userId, deletedAt: null }).session(session ?? null))) return result;
  const friendships = await Friendship.find({
    status: 'accepted', $or: [{ requester: userId }, { recipient: userId }],
  }).session(session ?? null).populate({
    path: 'requester recipient', select: '_id firstName lastName username',
    match: { deletedAt: null }, options: { session: session ?? null },
  }).lean();
  const accounts = new Map();
  for (const friendship of friendships) {
    if (!friendship.requester || !friendship.recipient) continue;
    const account = String(friendship.requester._id) === userId ? friendship.recipient : friendship.requester;
    accounts.set(String(account._id), account);
  }
  if (!accounts.size) return result;
  const selections = await EventSelection.find({
    eventId: { $in: eventIds }, userId: { $in: [...accounts.keys()] }, attending: true,
  }).select('eventId userId').session(session ?? null).lean();
  const avatarUrls = await avatarUrlsForUsers([...accounts.keys()], baseUrl, { session });
  const seen = new Set();
  for (const selection of selections) {
    const account = accounts.get(String(selection.userId));
    const eventId = String(selection.eventId);
    const key = `${eventId}:${selection.userId}`;
    if (!account || seen.has(key)) continue;
    seen.add(key);
    const friend = {
      id: String(account._id),
      name: `${account.firstName || ''} ${account.lastName || ''}`.trim() || account.username || 'Friend',
      username: account.username || '',
      avatar: avatarUrls.get(String(account._id)) || DEFAULT_AVATAR,
    };
    if (!result.has(eventId)) result.set(eventId, []);
    result.get(eventId).push(friend);
  }
  return result;
}

module.exports = { getFriendsAttendingByEvents };

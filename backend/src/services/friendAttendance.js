const mongoose = require('mongoose');
const Friendship = require('../models/Friendship');
const EventSelection = require('../models/EventSelection');

const DEFAULT_AVATAR =
  'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg';

/**
 * Returns a Map<eventIdString, FriendSummary[]> for all accepted friends
 * attending any of the provided eventIds.
 */
async function getFriendsAttendingByEvents(currentUserId, eventIds) {
  const result = new Map();
  if (!currentUserId || !eventIds || !eventIds.length) return result;

  const userObjectId = new mongoose.Types.ObjectId(currentUserId);

  // 1. Fetch all accepted friendships for the current user
  const friendships = await Friendship.find({
    status: 'accepted',
    $or: [{ requester: userObjectId }, { recipient: userObjectId }],
  })
    .populate('requester', 'firstName lastName username avatarUrl avatar profilePicture')
    .populate('recipient', 'firstName lastName username avatarUrl avatar profilePicture')
    .lean();

  if (!friendships.length) return result;

  const friendMap = new Map();
  for (const f of friendships) {
    const reqUser = f.requester;
    const recUser = f.recipient;
    const friendDoc = String(reqUser._id) === String(userObjectId) ? recUser : reqUser;
    if (!friendDoc || !friendDoc._id) continue;

    const fullName =
      `${friendDoc.firstName || ''} ${friendDoc.lastName || ''}`.trim() ||
      friendDoc.username ||
      'Friend';

    friendMap.set(String(friendDoc._id), {
      id: String(friendDoc._id),
      name: fullName,
      username: friendDoc.username || '',
      avatar:
        friendDoc.avatarUrl ||
        friendDoc.avatar ||
        friendDoc.profilePicture ||
        DEFAULT_AVATAR,
    });
  }

  const friendIds = Array.from(friendMap.keys()).map(id => new mongoose.Types.ObjectId(id));
  if (!friendIds.length) return result;

  // 2. Single batched query for all RSVP'd friends across the requested events
  const selections = await EventSelection.find({
    eventId: { $in: eventIds },
    userId: { $in: friendIds },
    attending: true,
  })
    .select('eventId userId')
    .lean();

  for (const sel of selections) {
    const eId = String(sel.eventId);
    const friend = friendMap.get(String(sel.userId));
    if (!friend) continue;

    if (!result.has(eId)) result.set(eId, []);
    result.get(eId).push(friend);
  }

  return result;
}

module.exports = {
  getFriendsAttendingByEvents,
};
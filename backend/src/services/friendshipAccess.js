const Friendship = require('../models/Friendship');

// Retained directional rows can disagree. A block always takes precedence.
async function areAcceptedFriends(firstId, secondId, { session } = {}) {
  const query = Friendship.find({ $or: [
    { requester: firstId, recipient: secondId }, { requester: secondId, recipient: firstId },
  ] }).select('status');
  if (session) query.session(session);
  const rows = await query.lean();
  return rows.some(row => row.status === 'accepted') && !rows.some(row => row.status === 'blocked');
}
module.exports = { areAcceptedFriends };

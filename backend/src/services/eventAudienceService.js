const mongoose = require('mongoose');
const EventSelection = require('../models/EventSelection');
const User = require('../models/User');

// Derive totals from saved choices rather than incrementing counters that can drift
// after retries or account closure. Only totals leave this service, never identities.
async function loadEventAudienceCounts(eventIds, session) {
  const ids = [...new Set(eventIds.map(String))].map(id => new mongoose.Types.ObjectId(id));
  const counts = new Map();
  if (!ids.length) return counts;

  const query = EventSelection.aggregate([
    { $match: { eventId: { $in: ids }, $or: [{ interested: true }, { attending: true }] } },
    // The unique account/event index already enforces this; grouping also makes the
    // definition explicitly one person per flag if historical duplicates exist.
    { $group: {
      _id: { eventId: '$eventId', userId: '$userId' },
      interested: { $max: { $cond: [{ $eq: ['$interested', true] }, 1, 0] } },
      attending: { $max: { $cond: [{ $eq: ['$attending', true] }, 1, 0] } },
    } },
    { $lookup: {
      from: User.collection.name,
      localField: '_id.userId', foreignField: '_id',
      pipeline: [{ $match: { deletedAt: null } }, { $project: { _id: 1 } }],
      as: 'activeAccount',
    } },
    { $match: { 'activeAccount.0': { $exists: true } } },
    { $group: {
      _id: '$_id.eventId',
      interestedCount: { $sum: '$interested' },
      attendingCount: { $sum: '$attending' },
    } },
  ]);
  if (session) query.session(session);
  for (const total of await query) {
    counts.set(String(total._id), {
      interestedCount: total.interestedCount,
      attendingCount: total.attendingCount,
    });
  }
  return counts;
}

module.exports = { loadEventAudienceCounts };

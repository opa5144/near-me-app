const Activity = require('../models/Activity');
const User = require('../models/User');
const { parseEventTimestamp, EventInputError } = require('./eventData');
const { ServiceError } = require('./serviceError');

async function generateSchedule(body) {
  try {
    const { interests, maxBudget, startTime, endTime, isSurprise } = body ?? {};
    const windowStart = parseEventTimestamp(startTime, 'Schedule start time');
    const windowEnd = parseEventTimestamp(endTime, 'Schedule end time');
    if (windowEnd <= windowStart) throw new ServiceError(400, 'The schedule must end after it starts.');
    const budget = maxBudget ?? 1000;
    if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0) {
      throw new ServiceError(400, 'Budget must be a non-negative number.');
    }
    if (interests !== undefined && (!Array.isArray(interests) || interests.some(value => typeof value !== 'string'))) {
      throw new ServiceError(400, 'Interests must be a list of categories.');
    }
    const now = new Date();
    const earliestStart = new Date(Math.max(windowStart.getTime(), now.getTime()));
    if (earliestStart >= windowEnd) return { totalCost: 0, schedule: [] };

    const query = {
      cost: { $gte: 0, $lte: budget },
      // Both bounds must match the same future slot, never different array elements.
      timeSlots: { $elemMatch: {
        startTime: { $type: 'date', $gte: earliestStart },
        endTime: { $type: 'date', $gt: now, $lte: windowEnd },
      } },
    };
    if (!isSurprise && interests && interests.length) query.category = { $in: interests };
    const closedHostIds = await User.distinct('_id', { deletedAt: { $ne: null } });
    query.hostId = { $nin: closedHostIds };
    const activities = await Activity.find(query).lean();

    let accumulatedCost = 0;
    const schedule = [];
    const currentTime = Date.now();
    const earliestSlot = Math.max(windowStart.getTime(), currentTime);
    for (const activity of activities) {
      // Matching a usable slot does not make expired or reversed sibling slots usable.
      const timeSlots = (Array.isArray(activity.timeSlots) ? activity.timeSlots : []).filter(slot => {
        if (!(slot?.startTime instanceof Date) || !(slot?.endTime instanceof Date)) return false;
        const start = slot.startTime.getTime();
        const end = slot.endTime.getTime();
        return Number.isFinite(start) && Number.isFinite(end) && start >= earliestSlot &&
          end > currentTime && end <= windowEnd.getTime() && start < end;
      });
      if (timeSlots.length && Number.isFinite(activity.cost) && accumulatedCost + activity.cost <= budget) {
        schedule.push({ ...activity, timeSlots });
        accumulatedCost += activity.cost;
      }
    }
    return { totalCost: accumulatedCost, schedule };
  } catch (error) {
    if (error instanceof EventInputError) throw new ServiceError(error.status, error.message);
    throw error;
  }
}

module.exports = { generateSchedule };

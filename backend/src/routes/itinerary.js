const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');

router.post('/generate', async (req, res) => {
  try {
    const { interests, maxBudget, startTime, endTime, isSurprise } = req.body;

    let query = {
      cost: { $lte: maxBudget || 1000 },
      'timeSlots.startTime': { $gte: new Date(startTime) },
      'timeSlots.endTime': { $lte: new Date(endTime) },
    };

    if (!isSurprise && interests && interests.length > 0) {
      query.category = { $in: interests };
    }

    const availableActivities = await Activity.find(query);

    let accumulatedCost = 0;
    const selectedSchedule = [];

    for (const activity of availableActivities) {
      if (accumulatedCost + activity.cost <= maxBudget) {
        selectedSchedule.push(activity);
        accumulatedCost += activity.cost;
      }
    }

    return res.status(200).json({
      success: true,
      totalCost: accumulatedCost,
      schedule: selectedSchedule,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

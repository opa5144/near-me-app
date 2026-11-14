const EventInvite = require('../models/EventInvite');
const Friendship = require('../models/Friendship');

async function sendEventInvite(req, res) {
  try {
    const senderId = req.user.id || req.user._id;
    const { eventId } = req.params;
    const { recipientId } = req.body;

    if (!recipientId) {
      return res.status(400).json({ message: 'recipientId is required.' });
    }
    if (String(senderId) === String(recipientId)) {
      return res.status(400).json({ message: 'You cannot invite yourself.' });
    }

    const areFriends = await Friendship.exists({
      status: 'accepted',
      $or: [
        { requester: senderId, recipient: recipientId },
        { requester: recipientId, recipient: senderId },
      ],
    });

    if (!areFriends) {
      return res.status(403).json({ message: 'You can only invite accepted friends.' });
    }

    const invite = await EventInvite.findOneAndUpdate(
      { eventId, senderId, recipientId },
      { $setOnInsert: { status: 'pending', read: false } },
      { upsert: true, new: true }
    );

    return res.status(201).json({ invite });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to send invite.' });
  }
}

async function getMyEventInvites(req, res) {
  try {
    const userId = req.user.id || req.user._id;

    const invites = await EventInvite.find({ recipientId: userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .populate('senderId', 'firstName lastName username avatarUrl')
      .populate('eventId', 'title date time venue bannerImage')
      .lean();

    return res.json({ invites });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to fetch invites.' });
  }
}

module.exports = {
  sendEventInvite,
  getMyEventInvites,
};
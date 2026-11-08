const express = require('express');
const router = express.Router();
const Friendship = require('../models/Friendship');
const User = require('../models/User'); 
const { requireAuth } = require('../middleware/requireAuth');

// Apply authentication middleware to all friend routes
router.use(requireAuth);

// GET /api/friends - Fetch accepted friends and pending incoming requests
router.get('/', async (req, res) => {
  try {
    const userId = req.userId;

    // Fetch accepted friendships
    const friendships = await Friendship.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: 'accepted',
    }).populate('requester recipient', '_id firstName lastName username avatarUrl');

    const friends = friendships.map((f) => {
      const friendObj = f.requester._id.toString() === userId ? f.recipient : f.requester;
      return {
        id: friendObj._id,
        name: `${friendObj.firstName || ''} ${friendObj.lastName || ''}`.trim() || friendObj.username,
        username: friendObj.username,
        avatar: friendObj.avatarUrl || 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg',
      };
    });

    // Fetch pending incoming requests
    const pendingRequestsRaw = await Friendship.find({
      recipient: userId,
      status: 'pending',
    }).populate('requester', '_id firstName lastName username avatarUrl');

    const pendingRequests = pendingRequestsRaw.map((r) => ({
      requestId: r._id,
      id: r.requester._id,
      name: `${r.requester.firstName || ''} ${r.requester.lastName || ''}`.trim() || r.requester.username,
      username: r.requester.username,
      avatar: r.requester.avatarUrl || 'https://static.vecteezy.com/system/resources/previews/077/167/094/non_2x/simple-icon-of-a-person-with-a-round-head-and-rounded-body-vector.jpg',
    }));

    res.json({ friends, pendingRequests });
  } catch (err) {
    res.status(500).json({ message: 'Server error fetching friends', error: err.message });
  }
});

// POST /api/friends/request - Send a friend request by target userId
router.post('/request', async (req, res) => {
  try {
    const { recipientId } = req.body;
    const requesterId = req.userId;

    if (recipientId === requesterId) {
      return res.status(400).json({ message: 'You cannot send a friend request to yourself.' });
    }

    const existing = await Friendship.findOne({
      $or: [
        { requester: requesterId, recipient: recipientId },
        { requester: recipientId, recipient: requesterId },
      ],
    });

    if (existing) {
      return res.status(400).json({ message: 'Relationship or request already exists.' });
    }

    const friendship = await Friendship.create({ requester: requesterId, recipient: recipientId });
    res.status(201).json({ success: true, friendship });
  } catch (err) {
    res.status(500).json({ message: 'Error sending friend request', error: err.message });
  }
});

// PATCH /api/friends/request/:requestId - Accept or reject a pending request
router.patch('/request/:requestId', async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'reject'
    const status = action === 'accept' ? 'accepted' : 'rejected';

    const friendship = await Friendship.findOneAndUpdate(
      { _id: req.params.requestId, recipient: req.userId, status: 'pending' },
      { status },
      { new: true }
    );

    if (!friendship) {
      return res.status(404).json({ message: 'Friend request not found or already processed.' });
    }

    res.json({ success: true, friendship });
  } catch (err) {
    res.status(500).json({ message: 'Error updating friend request', error: err.message });
  }
});

module.exports = router;
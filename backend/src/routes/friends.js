const express = require('express');
const router = express.Router();
const Friendship = require('../models/Friendship');
const { requireAuth } = require('../middleware/requireAuth');
const { withActiveAccountWrite, ActiveAccountWriteError } = require('../services/activeAccountWrite');

// Apply authentication middleware to all friend routes
router.use(requireAuth);

// GET /api/friends - Fetch accepted friends and pending incoming requests
router.get('/', async (req, res) => {
  try {
    const userId = String(req.userId);

    // Fetch accepted friendships
    const friendships = await Friendship.find({
      $or: [{ requester: userId }, { recipient: userId }],
      status: 'accepted',
    }).populate({
      path: 'requester recipient', select: '_id firstName lastName username avatarUrl', match: { deletedAt: null },
    });

    const friends = friendships.filter(f => f.requester && f.recipient).map((f) => {
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
    }).populate({ path: 'requester', select: '_id firstName lastName username avatarUrl', match: { deletedAt: null } });

    const pendingRequests = pendingRequestsRaw.filter(r => r.requester).map((r) => ({
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

    if (typeof recipientId !== 'string' || !/^[a-f0-9]{24}$/i.test(recipientId)) {
      return res.status(404).json({ message: 'This account is unavailable.' });
    }

    if (recipientId.toLowerCase() === String(requesterId).toLowerCase()) {
      return res.status(400).json({ message: 'You cannot send a friend request to yourself.' });
    }

    const friendship = await withActiveAccountWrite(req, [recipientId], async session => {
      const existing = await Friendship.findOne({
        $or: [
          { requester: requesterId, recipient: recipientId },
          { requester: recipientId, recipient: requesterId },
        ],
      }).session(session);
      if (existing) throw new ActiveAccountWriteError(400, 'Relationship or request already exists.');

      const [created] = await Friendship.create([{ requester: requesterId, recipient: recipientId }], { session });
      return created;
    });
    res.status(201).json({ success: true, friendship });
  } catch (err) {
    if (err instanceof ActiveAccountWriteError) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: 'Error sending friend request', error: err.message });
  }
});

// PATCH /api/friends/request/:requestId - Accept or reject a pending request
router.patch('/request/:requestId', async (req, res) => {
  try {
    const { action } = req.body; // 'accept' or 'reject'
    if (action !== 'accept' && action !== 'reject') {
      return res.status(400).json({ message: 'Choose accept or reject.' });
    }
    const status = action === 'accept' ? 'accepted' : 'rejected';

    const pending = await Friendship.findOne({ _id: req.params.requestId, recipient: req.userId, status: 'pending' });
    // Preserve archived relationships without allowing another account to alter them.
    if (!pending) {
      return res.status(404).json({ message: 'Friend request not found or already processed.' });
    }
    const friendship = await withActiveAccountWrite(req, [pending.requester], async session => {
      const updated = await Friendship.findOneAndUpdate(
        { _id: pending._id, requester: pending.requester, recipient: req.userId, status: 'pending' },
        { $set: { status } },
        { new: true, session }
      );
      if (!updated) throw new ActiveAccountWriteError(404, 'Friend request not found or already processed.');
      return updated;
    });

    res.json({ success: true, friendship });
  } catch (err) {
    if (err instanceof ActiveAccountWriteError) return res.status(err.status).json({ message: err.message });
    res.status(500).json({ message: 'Error updating friend request', error: err.message });
  }
});

module.exports = router;

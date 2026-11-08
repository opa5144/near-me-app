const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAuth } = require('../middleware/requireAuth');

// Build phone-accessible API URLs using the request host
function apiBase(req) {
  return (process.env.PUBLIC_API_URL || (req.protocol + '://' + req.get('host') + '/api')).replace(/\/$/, '');
}

// PUT /api/users/profile - Update user profile information (like avatar)
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { avatarBase64, imageMimeType, firstName, lastName } = req.body;

    // Build update object dynamically to support partial updates
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName.trim();
    if (lastName !== undefined) updateData.lastName = lastName.trim();

    // If an avatar image was provided as base64, store it as binary and construct permanent URL
    if (avatarBase64) {
      updateData.avatarData = Buffer.from(avatarBase64, 'base64');
      updateData.avatarMimeType = imageMimeType || 'image/jpeg';
      updateData.avatarUrl = `${apiBase(req)}/users/${req.userId}/avatar`;
    }

    // Find user by req.userId (set by requireAuth) and update
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: req.userId, deletedAt: null,
        $expr: { $eq: [{ $ifNull: ['$authVersion', 0] }, req.authVersion ?? 0] },
      },
      { $set: updateData },
      { returnDocument: 'after', runValidators: true } // Ensures schema rules are updated
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: updatedUser,
    });
  } catch (err) {
    console.error('Error updating user profile:', err);
    return res.status(500).json({ message: 'Server error while updating profile.' });
  }
});

// Serve user avatar binary bytes publicly so profile images load across devices and restarts
router.get('/:id/avatar', async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, deletedAt: null }).select('+avatarData +avatarMimeType');
    
    if (!user || !user.avatarData || !user.avatarMimeType) {
      return res.sendStatus(404);
    }
    
    res.set('Content-Type', user.avatarMimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    return res.send(user.avatarData);
  } catch (err) {
    console.error('Error serving avatar:', err);
    return res.status(500).json({ message: 'Unable to load this avatar.' });
  }
});


// GET /api/users/me - Fetch current signed-in user's profile info including avatarUrl
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.userId, deletedAt: null });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.status(200).json({ success: true, user });
  } catch (err) {
    console.error('Error fetching current user profile:', err);
    return res.status(500).json({ message: 'Server error while fetching profile.' });
  }
});


module.exports = router;

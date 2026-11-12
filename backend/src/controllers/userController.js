const userService = require('../services/userService');
const { ServiceError } = require('../services/serviceError');
const { getAuthContext, apiBaseUrl, sendServiceError } = require('./controllerUtils');

async function updateProfile(req, res) {
  try {
    const user = await userService.updateUserProfile(getAuthContext(req), req.body, apiBaseUrl(req));
    return res.status(200).json({ success: true, message: 'Profile updated successfully.', user });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Error updating user profile:', error);
    return res.status(500).json({ message: 'Server error while updating profile.' });
  }
}

async function getAvatar(req, res) {
  try {
    const avatar = await userService.fetchUserAvatar(req.params.id);
    res.set('Content-Type', avatar.mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    return res.send(avatar.data);
  } catch (error) {
    // Keep the original public image endpoint's missing-image status response.
    if (error instanceof ServiceError && error.status === 404) return res.sendStatus(404);
    console.error('Error serving avatar:', error);
    return res.status(500).json({ message: 'Unable to load this avatar.' });
  }
}

async function getCurrentUser(req, res) {
  try {
    const user = await userService.fetchCurrentUser(getAuthContext(req).userId, apiBaseUrl(req));
    return res.status(200).json({ success: true, user });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Error fetching current user profile:', error);
    return res.status(500).json({ message: 'Server error while fetching profile.' });
  }
}

module.exports = { updateProfile, getAvatar, getCurrentUser };

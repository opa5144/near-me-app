const friendService = require('../services/friendService');
const { getAuthContext, apiBaseUrl, sendServiceError } = require('./controllerUtils');

function sendFriendError(res, error, fallback) {
  if (sendServiceError(res, error)) return;
  return res.status(500).json({ message: fallback, error: error.message });
}

async function getNetwork(req, res) {
  try {
    const network = await friendService.fetchFriendsNetwork(getAuthContext(req).userId, apiBaseUrl(req));
    return res.json(network);
  } catch (error) {
    return sendFriendError(res, error, 'Server error fetching friends');
  }
}

async function sendRequest(req, res) {
  try {
    const friendship = await friendService.createFriendRequest(getAuthContext(req), req.body);
    return res.status(201).json({ success: true, friendship });
  } catch (error) {
    return sendFriendError(res, error, 'Error sending friend request');
  }
}

async function respondToRequest(req, res) {
  try {
    // Simply pass req.body directly since friendService expects { action }
    const friendship = await friendService.respondToFriendRequest(
      getAuthContext(req), 
      req.params.requestId, 
      req.body
    );
    return res.json({ success: true, friendship });
  } catch (error) {
    return sendFriendError(res, error, 'Error updating friend request');
  }
}

module.exports = { getNetwork, sendRequest, respondToRequest };
const organizerFollowService = require('../services/organizerFollowService');
const { getAuthContext, sendServiceError } = require('./controllerUtils');

function sendError(res, error) {
  if (sendServiceError(res, error)) return res;
  console.error('Organizer follow request failed:', error.name);
  return res.status(500).json({ message: 'Unable to manage organizers you follow. Please try again.' });
}

async function listFollows(req, res) {
  try { return res.json(await organizerFollowService.listFollows(getAuthContext(req))); }
  catch (error) { return sendError(res, error); }
}
async function followOrganizer(req, res) {
  try { return res.json(await organizerFollowService.followOrganizer(getAuthContext(req), req.params.organizerId, req.body)); }
  catch (error) { return sendError(res, error); }
}
async function unfollowOrganizer(req, res) {
  try { await organizerFollowService.unfollowOrganizer(getAuthContext(req), req.params.organizerId, req.body); return res.sendStatus(204); }
  catch (error) { return sendError(res, error); }
}

module.exports = { listFollows, followOrganizer, unfollowOrganizer };

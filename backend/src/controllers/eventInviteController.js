const invites = require('../services/eventInviteService');
const { getAuthContext, apiBaseUrl, sendServiceError } = require('./controllerUtils');

function fail(res, error) {
  if (sendServiceError(res, error)) return;
  console.error('Event invitation failed:', error.name);
  return res.status(500).json({ message: 'Unable to manage this invitation. Please try again.' });
}

async function sendEventInvite(req, res) {
  res.set('Cache-Control', 'no-store');
  try { return res.status(201).json(await invites.sendInvite(getAuthContext(req), req.params.eventId, req.body, apiBaseUrl(req))); }
  catch (error) { return fail(res, error); }
}

async function getMyEventInvites(req, res) {
  res.set('Cache-Control', 'no-store');
  try { return res.json(await invites.listInvites(getAuthContext(req), apiBaseUrl(req))); }
  catch (error) { return fail(res, error); }
}
async function getEventInvite(req, res) {
  res.set('Cache-Control', 'no-store');
  try { return res.json(await invites.getInvite(getAuthContext(req), req.params.inviteId, apiBaseUrl(req))); }
  catch (error) { return fail(res, error); }
}
async function updateEventInvite(req, res) {
  res.set('Cache-Control', 'no-store');
  try { return res.json(await invites.updateInvite(getAuthContext(req), req.params.inviteId, req.body, apiBaseUrl(req))); }
  catch (error) { return fail(res, error); }
}
module.exports = { sendEventInvite, getMyEventInvites, getEventInvite, updateEventInvite };

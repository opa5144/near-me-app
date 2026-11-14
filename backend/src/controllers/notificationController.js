const inboxService = require('../services/notifications/inboxService');
const preferenceService = require('../services/notifications/preferenceService');
const { getAuthContext, sendServiceError } = require('./controllerUtils');

function sendError(res, error) {
  if (sendServiceError(res, error)) return res;
  console.error('Notification request failed:', error.name);
  return res.status(500).json({ message: 'Unable to load or update your notifications. Please try again.' });
}

async function listInbox(req, res) {
  try { return res.json(await inboxService.listInbox(getAuthContext(req), req.query)); }
  catch (error) { return sendError(res, error); }
}
async function getUnreadCount(req, res) {
  try { return res.json(await inboxService.unreadCount(getAuthContext(req))); }
  catch (error) { return sendError(res, error); }
}
async function setRead(req, res) {
  try { return res.json(await inboxService.setRead(getAuthContext(req), req.params.id, req.body)); }
  catch (error) { return sendError(res, error); }
}
async function readAll(req, res) {
  try { return res.json(await inboxService.readAll(getAuthContext(req), req.body)); }
  catch (error) { return sendError(res, error); }
}
async function getPreferences(req, res) {
  try { return res.json(await preferenceService.getPreferences(getAuthContext(req))); }
  catch (error) { return sendError(res, error); }
}
async function updatePreferences(req, res) {
  try { return res.json(await preferenceService.updatePreferences(getAuthContext(req), req.body)); }
  catch (error) { return sendError(res, error); }
}

module.exports = { listInbox, getUnreadCount, setRead, readAll, getPreferences, updatePreferences };

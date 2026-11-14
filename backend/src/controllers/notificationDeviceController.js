const deviceService = require('../services/notifications/deviceService');
const { getAuthContext, sendServiceError } = require('./controllerUtils');

function sendError(res, error) {
  if (sendServiceError(res, error)) return res;
  console.error('Push device request failed:', error.name);
  return res.status(500).json({ message: 'Unable to manage your push devices. Please try again.' });
}

async function listDevices(req, res) {
  try { return res.json(await deviceService.listDevices(getAuthContext(req))); }
  catch (error) { return sendError(res, error); }
}
async function registerDevice(req, res) {
  try { return res.json(await deviceService.registerDevice(getAuthContext(req), req.body)); }
  catch (error) { return sendError(res, error); }
}
async function disableDevice(req, res) {
  try { await deviceService.disableDevice(getAuthContext(req), req.params.id, req.body); return res.sendStatus(204); }
  catch (error) { return sendError(res, error); }
}

module.exports = { listDevices, registerDevice, disableDevice };

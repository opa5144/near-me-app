const settingsService = require('../services/settingsService');
const { getAuthContext, sendServiceError } = require('./controllerUtils');

function sendError(res, error) {
  if (sendServiceError(res, error)) return res;
  console.error('Settings request failed:', error.name);
  return res.status(500).json({ message: 'Unable to save or load your settings. Please try again.' });
}

async function getCitySuggestions(req, res) {
  try { return res.json(await settingsService.getCitySuggestions(req.query.q)); }
  catch (error) { return sendError(res, error); }
}

async function getPreferences(req, res) {
  try { return res.json(await settingsService.getPreferences(getAuthContext(req))); }
  catch (error) { return sendError(res, error); }
}

async function updatePreferences(req, res) {
  try { return res.json(await settingsService.updatePreferences(getAuthContext(req), req.body)); }
  catch (error) { return sendError(res, error); }
}

async function getNotifications(req, res) {
  try { return res.json(await settingsService.getNotifications(getAuthContext(req))); }
  catch (error) { return sendError(res, error); }
}

async function updateNotifications(req, res) {
  try { return res.json(await settingsService.updateNotifications(getAuthContext(req), req.body)); }
  catch (error) { return sendError(res, error); }
}

module.exports = { getCitySuggestions, getPreferences, updatePreferences, getNotifications, updateNotifications };

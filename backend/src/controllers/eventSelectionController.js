const selections = require('../services/eventSelectionService');
const { getAuthContext, apiBaseUrl, sendServiceError } = require('./controllerUtils');

async function listSelections(req, res) {
  try {
    return res.json({ selections: await selections.listSelections(getAuthContext(req)) });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Event selections failed:', error.name);
    return res.status(500).json({ message: 'Unable to load your event selections. Please try again.' });
  }
}

async function getHistory(req, res) {
  try {
    const bookings = await selections.getBookingHistory(getAuthContext(req), apiBaseUrl(req));
    return res.json({ bookings });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Booking history failed:', error.name);
    return res.status(500).json({ message: 'Unable to load your booking history. Please try again.' });
  }
}

async function getBooking(req, res) {
  try {
    const booking = await selections.getBooking(getAuthContext(req), req.params.id, apiBaseUrl(req));
    return res.json({ booking });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Booking details failed:', error.name);
    return res.status(500).json({ message: 'Unable to load this booking. Please try again.' });
  }
}

async function updateSelection(req, res) {
  try {
    const selection = await selections.updateSelection(getAuthContext(req), req.params.eventId, req.body);
    return res.json({ selection });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Event selection update failed:', error.name);
    return res.status(500).json({ message: 'Unable to save your event selection. Please try again.' });
  }
}

module.exports = { listSelections, getHistory, getBooking, updateSelection };

const tickets = require('../services/ticketService');
const { getAuthContext, apiBaseUrl, sendServiceError } = require('./controllerUtils');

function privateResponse(res) {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
}

async function listTickets(req, res) {
  try {
    privateResponse(res);
    return res.json({ tickets: await tickets.listMyTickets(getAuthContext(req), apiBaseUrl(req)) });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Ticket list failed:', error.name);
    return res.status(500).json({ message: 'Unable to load your tickets. Please try again.' });
  }
}

async function getTicket(req, res) {
  try {
    privateResponse(res);
    return res.json(await tickets.getMyTicket(getAuthContext(req), req.params.id, req.body, apiBaseUrl(req)));
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Ticket access failed:', error.name);
    return res.status(500).json({ message: 'Unable to open your ticket. Please try again.' });
  }
}

async function checkIn(req, res) {
  try {
    privateResponse(res);
    return res.json(await tickets.checkIn(getAuthContext(req), req.params.id, req.body));
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Event check-in failed:', error.name);
    return res.status(500).json({ message: 'Unable to check in this attendee. Please try again.' });
  }
}

module.exports = { listTickets, getTicket, checkIn };

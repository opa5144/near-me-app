const events = require('../services/eventService');
const { getAuthContext, apiBaseUrl, sendServiceError } = require('./controllerUtils');

async function listEvents(req, res) {
  try {
    const items = await events.listPublicEvents(apiBaseUrl(req));
    res.set('Cache-Control', 'no-store');
    return res.json({ events: items });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Event list failed:', error.name);
    return res.status(500).json({ message: 'Unable to load events. Please try again.' });
  }
}

async function listHostedEvents(req, res) {
  try {
    res.set('Cache-Control', 'no-store');
    return res.json({ events: await events.listHostedEvents(getAuthContext(req), apiBaseUrl(req)) });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    return res.status(500).json({ message: 'Unable to load your events.' });
  }
}

async function getImage(req, res) {
  try {
    const image = await events.getEventImage(req.params.id);
    if (!image) return res.sendStatus(404);
    res.set('Content-Type', image.mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    return res.send(image.data);
  } catch (error) {
    if (sendServiceError(res, error)) return;
    return res.status(500).json({ message: 'Unable to load this image.' });
  }
}

async function getEvent(req, res) {
  try {
    const event = await events.getEvent(req.params.id, apiBaseUrl(req));
    res.set('Cache-Control', 'no-store');
    return res.json({ event });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    return res.status(500).json({ message: 'Unable to load this event.' });
  }
}

async function getPhoto(req, res) {
  try {
    const photo = await events.getEventPhoto(req.params.id, req.params.photoId);
    if (!photo) return res.sendStatus(404);
    res.set('Content-Type', photo.mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    return res.send(photo.data);
  } catch (error) {
    if (sendServiceError(res, error)) return;
    return res.status(500).json({ message: 'Unable to load this image.' });
  }
}

async function createEvent(req, res) {
  try {
    const event = await events.createEvent(getAuthContext(req), req.body, apiBaseUrl(req));
    return res.status(201).json({ event });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Event creation failed:', error.name);
    return res.status(500).json({ message: 'Unable to create your event. Please try again.' });
  }
}

async function updateEvent(req, res) {
  try {
    const event = await events.updateEvent(getAuthContext(req), req.params.id, req.body, apiBaseUrl(req));
    return res.json({ message: 'Event updated successfully!', event });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Event update failed:', error.name, error);
    return res.status(500).json({ message: 'Unable to update your event. Please try again.' });
  }
}

module.exports = { listEvents, listHostedEvents, getImage, getPhoto, getEvent, createEvent, updateEvent };

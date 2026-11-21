const events = require('../services/eventService');
const lifecycle = require('../services/eventDraftService');
const { getAuthContext, apiBaseUrl, sendServiceError } = require('./controllerUtils');

async function listEvents(req, res) {
  try {
    const items = await events.listPublicEvents(apiBaseUrl(req), req.userId);
    res.set('Cache-Control', 'private, no-store');
    return res.json({ events: items });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Event list failed:', error.name);
    return res.status(500).json({ message: 'Unable to load events. Please try again.' });
  }
}

async function listHostedEvents(req, res) {
  try {
    const items = await events.listHostedEvents(getAuthContext(req), apiBaseUrl(req));
    res.set('Cache-Control', 'private, no-store');
    return res.json({ events: items });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    return res.status(500).json({ message: 'Unable to load your events.' });
  }
}

async function getImage(req, res) {
  try {
    const image = await events.getEventImage(req.params.id, req.userId);
    if (!image) return res.sendStatus(404);
    res.set('Content-Type', image.mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, no-store');
    res.vary('Authorization');
    return res.send(image.data);
  } catch (error) {
    if (sendServiceError(res, error)) return;
    return res.status(500).json({ message: 'Unable to load this image.' });
  }
}

async function getEvent(req, res) {
  try {
    const event = await events.getEvent(req.params.id, apiBaseUrl(req), req.userId);
    res.set('Cache-Control', 'no-store');
    return res.json({ event });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    return res.status(500).json({ message: 'Unable to load this event.' });
  }
}

async function getPhoto(req, res) {
  try {
    const photo = await events.getEventPhoto(req.params.id, req.params.photoId, req.userId);
    if (!photo) return res.sendStatus(404);
    res.set('Content-Type', photo.mimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, no-store');
    res.vary('Authorization');
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
    console.error('Event update failed:', error.name);
    return res.status(500).json({ message: 'Unable to update your event. Please try again.' });
  }
}

async function cancelEvent(req, res) {
  try {
    const event = await events.cancelEvent(getAuthContext(req), req.params.id, req.body, apiBaseUrl(req));
    res.set('Cache-Control', 'no-store');
    return res.json({ message: 'Event cancelled.', event });
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Event cancellation failed:', error.name);
    return res.status(500).json({ message: 'Unable to cancel your event. Please try again.' });
  }
}

function lifecycleAction(action, successStatus = 200) {
  return async (req, res) => {
    try {
      const event = await action(getAuthContext(req), req.params.id, req.body, apiBaseUrl(req));
      res.set('Cache-Control', 'no-store');
      return res.status(successStatus).json({ event });
    } catch (error) {
      if (sendServiceError(res, error)) return;
      console.error('Event lifecycle action failed:', error.name);
      return res.status(500).json({ message: 'Unable to save this event. Please try again.' });
    }
  };
}

module.exports = {
  listEvents, listHostedEvents, getImage, getPhoto, getEvent, createEvent, updateEvent, cancelEvent,
  createDraft: lifecycleAction((auth, id, body, baseUrl) => lifecycle.saveDraft(auth, undefined, body, baseUrl), 201),
  updateDraft: lifecycleAction(lifecycle.saveDraft), publishDraft: lifecycleAction(lifecycle.publishDraft),
  archiveEvent: lifecycleAction(lifecycle.archivePublishedEvent),
  rescheduleEvent: lifecycleAction(lifecycle.rescheduleEvent, 201),
};

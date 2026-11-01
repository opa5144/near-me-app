const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const { requireAuth } = require('../middleware/requireAuth');
const { parseCreateEvent, toEventItem, EventInputError } = require('../services/eventData');

const router = express.Router();

// Build phone-accessible image URLs, using an explicit public API base when configured.
function apiBase(req) {
  return (process.env.PUBLIC_API_URL || (req.protocol + '://' + req.get('host') + '/api')).replace(/\/$/, '');
}
// Reject malformed IDs as client errors before Mongoose attempts a database lookup.
function validId(id) {
  return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id) && mongoose.isObjectIdOrHexString(id);
}

// Public discovery returns newest records first, formatted to the mobile EventItem shape.
router.get('/', async (req, res) => {
  try {
    const events = await Event.find({}).sort({ createdAt: -1, _id: -1 }).lean();
    return res.json({ events: events.map(event => toEventItem(event, apiBase(req))) });
  } catch (err) {
    console.error('Event list failed:', err.name);
    return res.status(500).json({ message: 'Unable to load events. Please try again.' });
  }
});

// Register this before /:id so "mine" is never treated as a MongoDB ID.
router.get('/mine', requireAuth, async (req, res) => {
  try {
    // The authenticated session determines whose host list is returned.
    const events = await Event.find({ hostId: req.userId }).sort({ createdAt: -1, _id: -1 }).lean();
    return res.json({ events: events.map(event => toEventItem(event, apiBase(req))) });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to load your events.' });
  }
});

// Serve public JPEG bytes separately so event list/detail JSON stays small.
router.get('/:id/image', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid event ID.' });
  try {
    const event = await Event.findById(req.params.id).select('+imageData');
    if (!event || !event.imageData || !event.imageMimeType) return res.sendStatus(404);
    res.set('Content-Type', event.imageMimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(event.imageData);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to load this image.' });
  }
});

// Detail responses use the same serializer as lists and newly created events.
router.get('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid event ID.' });
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ message: 'Event not found.' });
    return res.json({ event: toEventItem(event, apiBase(req)) });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to load this event.' });
  }
});

// Only signed-in users can create events; validation returns a whitelist of accepted fields.
router.post('/', requireAuth, async (req, res) => {
  try {
    const fields = parseCreateEvent(req.body);
    // Ownership always comes from the verified server session.
    // req.body.hostId, seedKey, imageMimeType, etc. are not accepted.
    const event = await Event.create({ ...fields, hostId: req.userId });
    return res.status(201).json({ event: toEventItem(event, apiBase(req)) });
  } catch (err) {
    if (err instanceof EventInputError) return res.status(err.status).json({ message: err.message });
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: 'Please check your event details.' });
    }
    console.error('Event creation failed:', err.name);
    return res.status(500).json({ message: 'Unable to create your event. Please try again.' });
  }
});

module.exports = router;

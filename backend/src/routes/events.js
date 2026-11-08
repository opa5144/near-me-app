const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const User = require('../models/User');
const { requireAuth } = require('../middleware/requireAuth');
const { parseCreateEvent, toEventItem, EventInputError } = require('../services/eventData');
const { withActiveAccountWrite, ActiveAccountWriteError } = require('../services/activeAccountWrite');

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
    const events = await Event.find({}).populate({
      path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null },
    }).sort({ createdAt: -1, _id: -1 }).lean();
    // Closed hosts' events stay archived in Atlas and disappear from public discovery.
    res.set('Cache-Control', 'no-store');
    return res.json({ events: events.filter(event => event.hostId).map(event => toEventItem(event, apiBase(req))) });
  } catch (err) {
    console.error('Event list failed:', err.name);
    return res.status(500).json({ message: 'Unable to load events. Please try again.' });
  }
});

// Register this before /:id so "mine" is never treated as a MongoDB ID.
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const events = await Event.find({ hostId: req.userId }).populate('hostId', 'firstName lastName username').sort({ createdAt: -1, _id: -1 }).lean();
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
    if (!event || !event.imageData || !event.imageMimeType ||
        !(await User.exists({ _id: event.hostId, deletedAt: null }))) return res.sendStatus(404);
    res.set('Content-Type', event.imageMimeType);
    res.set('X-Content-Type-Options', 'nosniff');
    // Recheck host status on every request instead of caching archived images publicly.
    res.set('Cache-Control', 'no-store');
    return res.send(event.imageData);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to load this image.' });
  }
});

// Detail responses use the same serializer as lists and newly created events.
router.get('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid event ID.' });
  try {
    const event = await Event.findById(req.params.id).populate({
      path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null },
    }).lean();
    if (!event || !event.hostId) return res.status(404).json({ message: 'Event not found.' });
    res.set('Cache-Control', 'no-store');
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
    const savedEvent = await withActiveAccountWrite(req, [], async session => {
      const [event] = await Event.create([{ ...fields, hostId: req.userId }], { session });
      const populatedEvent = await Event.findById(event._id).session(session).populate({
        path: 'hostId', select: 'firstName lastName username', options: { session },
      }).lean();
      return toEventItem(populatedEvent, apiBase(req));
    });
    return res.status(201).json({ event: savedEvent });
  } catch (err) {
    if (err instanceof ActiveAccountWriteError) return res.status(err.status).json({ message: err.message });
    if (err instanceof EventInputError) return res.status(err.status).json({ message: err.message });
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: 'Please check your event details.' });
    }
    console.error('Event creation failed:', err.name);
    return res.status(500).json({ message: 'Unable to create your event. Please try again.' });
  }
});

// PATCH endpoint to update existing events 
router.patch('/:id', requireAuth, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid event ID.' });
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found.' });
    if (String(event.hostId) !== String(req.userId)) {
      return res.status(403).json({ message: 'Unauthorized to edit this event.' });
    }
    const fields = parseCreateEvent(req.body);
    const updateData = { ...fields, hostId: req.userId };
    
    if (!req.body.imageBase64 && !updateData.imageData) {
      delete updateData.imageData;
      delete updateData.imageMimeType;
    }

    const savedEvent = await withActiveAccountWrite(req, [event.hostId], async session => {
      // Recheck ownership on the write itself, inside the account-fenced transaction.
      const updated = await Event.findOneAndUpdate({ _id: req.params.id, hostId: req.userId },
        { $set: updateData }, { new: true, runValidators: true, session }).populate({
          path: 'hostId', select: 'firstName lastName username', options: { session },
        }).lean();
      if (!updated) throw new ActiveAccountWriteError(404, 'Event not found.');
      return toEventItem(updated, apiBase(req));
    });
    
    return res.json({ 
      message: 'Event updated successfully!', 
      event: savedEvent
    });
  } catch (err) {
    if (err instanceof ActiveAccountWriteError) return res.status(err.status).json({ message: err.message });
    if (err instanceof EventInputError) return res.status(err.status).json({ message: err.message });
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: 'Please check your event details.' });
    }
    console.error('Event update failed:', err.name, err);
    return res.status(500).json({ message: 'Unable to update your event. Please try again.' });
  }
});

module.exports = router;

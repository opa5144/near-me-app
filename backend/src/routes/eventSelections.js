const express = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const EventSelection = require('../models/EventSelection');
const { requireAuth } = require('../middleware/requireAuth');
const { toEventItem } = require('../services/eventData');
const { withActiveAccountWrite, ActiveAccountWriteError } = require('../services/activeAccountWrite');

const router = express.Router();

router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(requireAuth);

function validId(value) {
  return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value) && mongoose.isObjectIdOrHexString(value);
}

function apiBase(req) {
  return (process.env.PUBLIC_API_URL || (req.protocol + '://' + req.get('host') + '/api')).replace(/\/$/, '');
}

function selectedBy(userId) {
  return { userId, $or: [{ interested: true }, { attending: true }] };
}

function selectionItem(selection) {
  return {
    eventId: String(selection.eventId._id ?? selection.eventId),
    interested: Boolean(selection.interested),
    attending: Boolean(selection.attending),
  };
}

function bookingItem(selection, req) {
  return {
    id: String(selection._id),
    ...selectionItem(selection),
    // History shows the current event information; this is not a purchase or an immutable snapshot.
    event: toEventItem(selection.eventId, apiBase(req)),
  };
}

function pastEventPopulation(now) {
  return {
    path: 'eventId', match: { endsAt: { $lte: now } },
    populate: { path: 'hostId', select: 'firstName lastName username', match: { deletedAt: null } },
  };
}

// Return only this account's saved choices. Closed hosts' events stay stored but hidden.
router.get('/', async (req, res) => {
  try {
    const selections = await EventSelection.find(selectedBy(req.userId)).populate({
      path: 'eventId', select: '_id hostId',
      populate: { path: 'hostId', select: '_id', match: { deletedAt: null } },
    }).lean();
    return res.json({
      selections: selections.filter(selection => selection.eventId?.hostId).map(selectionItem),
    });
  } catch (error) {
    console.error('Event selections failed:', error.name);
    return res.status(500).json({ message: 'Unable to load your event selections. Please try again.' });
  }
});

// Only persisted selections for already-ended events become history; no sample history is invented.
router.get('/history', async (req, res) => {
  try {
    const selections = await EventSelection.find(selectedBy(req.userId))
      .populate(pastEventPopulation(new Date())).lean();
    const visible = selections.filter(selection => selection.eventId?.hostId);
    visible.sort((a, b) => new Date(b.eventId.endsAt).getTime() - new Date(a.eventId.endsAt).getTime() ||
      String(b._id).localeCompare(String(a._id)));
    return res.json({ bookings: visible.map(selection => bookingItem(selection, req)) });
  } catch (error) {
    console.error('Booking history failed:', error.name);
    return res.status(500).json({ message: 'Unable to load your booking history. Please try again.' });
  }
});

router.get('/history/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid booking ID.' });
  try {
    const selection = await EventSelection.findOne({ _id: req.params.id, ...selectedBy(req.userId) })
      .populate(pastEventPopulation(new Date())).lean();
    if (!selection?.eventId?.hostId) return res.status(404).json({ message: 'Booking not found.' });
    return res.json({ booking: bookingItem(selection, req) });
  } catch (error) {
    console.error('Booking details failed:', error.name);
    return res.status(500).json({ message: 'Unable to load this booking. Please try again.' });
  }
});

router.put('/:eventId', async (req, res) => {
  if (!validId(req.params.eventId)) return res.status(400).json({ message: 'Invalid event ID.' });
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ message: 'Please submit your event selection.' });
  }
  const changes = {};
  for (const flag of ['interested', 'attending']) {
    if (!Object.prototype.hasOwnProperty.call(body, flag)) continue;
    if (typeof body[flag] !== 'boolean') {
      return res.status(400).json({ message: 'Interested and attending must be true or false.' });
    }
    changes[flag] = body[flag];
  }
  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ message: 'Provide interested, attending, or both to update your selection.' });
  }

  try {
    // Create the unique index before the first transactional upsert, never inside the transaction.
    await EventSelection.init();
    const event = await Event.findById(req.params.eventId).select('_id hostId');
    if (!event?.hostId) return res.status(404).json({ message: 'Event not found.' });

    const selection = await withActiveAccountWrite(req, [event.hostId], async session => {
      // Host closure/event edits use the same account fence, so recheck the schedule after locking it.
      const current = await Event.findOne({ _id: event._id, hostId: event.hostId })
        .select('_id endsAt').session(session);
      if (!current) throw new ActiveAccountWriteError(404, 'Event not found.');
      const endsAt = current.endsAt?.getTime();
      if (!Number.isFinite(endsAt) || endsAt <= Date.now()) {
        throw new ActiveAccountWriteError(409, 'This event has ended. Past selections are read-only.');
      }

      // Set only supplied flags; updating attendance cannot erase an existing interest choice.
      return EventSelection.findOneAndUpdate({ userId: req.userId, eventId: event._id }, {
        $set: changes,
        $setOnInsert: { userId: req.userId, eventId: event._id },
      }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
    });
    return res.json({ selection: selectionItem(selection) });
  } catch (error) {
    if (error instanceof ActiveAccountWriteError) return res.status(error.status).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'Your event selection changed. Please retry.' });
    if (error.name === 'ValidationError') return res.status(400).json({ message: 'Please check your event selection.' });
    console.error('Event selection update failed:', error.name);
    return res.status(500).json({ message: 'Unable to save your event selection. Please try again.' });
  }
});

module.exports = router;

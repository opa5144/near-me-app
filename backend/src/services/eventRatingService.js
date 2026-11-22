const mongoose = require('mongoose');
const { findEventById } = require('../models/eventStore');
const User = require('../models/User');
const EventSelection = require('../models/EventSelection');
const EventRating = require('../models/EventRating');
const { EVENT_RATING_OPTIONS, EVENT_RATING_SCORES } = require('../constants/eventRatings');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { ServiceError } = require('./serviceError');

const EVENT_FIELDS = '_id hostId startsAt endsAt status useTickets';

function requireEventId(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id) || !mongoose.isObjectIdOrHexString(id)) {
    throw new ServiceError(400, 'Invalid event ID.');
  }
}

// Reused by rating prompts: saved interest alone never grants rating eligibility.
function ratingEligibility(event, selection, userId, now = new Date()) {
  if (String(event.hostId) === String(userId)) {
    return { canRate: false, reason: 'You cannot rate your own event.' };
  }
  if (['cancelled', 'archived', 'draft'].includes(event.status)) return { canRate: false, reason: 'This event is unavailable for rating.' };
  if (!selection?.attending) return { canRate: false, reason: 'You must be registered for this event to rate it.' };
  if (event.useTickets && !selection.attended) return { canRate: false, reason: 'Your ticket must be checked in by the host before you can rate this event.' };
  const start = event.startsAt instanceof Date ? event.startsAt.getTime() : NaN;
  const end = event.endsAt instanceof Date ? event.endsAt.getTime() : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    return { canRate: false, reason: 'The event schedule is unavailable for rating.' };
  }
  if (end > new Date(now).getTime()) return { canRate: false, reason: 'You can rate this event after it ends.' };
  return { canRate: true, reason: null };
}

function ratingItem(rating) {
  return rating ? {
    id: String(rating._id), eventId: String(rating.eventId), score: rating.score,
    createdAt: rating.createdAt, updatedAt: rating.updatedAt,
  } : null;
}

function ratingResponse(event, rating, eligibility) {
  return { eventId: String(event._id), rating: ratingItem(rating), eligibility, scores: EVENT_RATING_OPTIONS };
}

async function readEvent(auth, eventId) {
  requireEventId(eventId);
  if (!(await User.exists({ _id: auth.userId, deletedAt: null }))) throw new ServiceError(401, 'Please log in again.');
  const event = await findEventById(eventId, { select: EVENT_FIELDS });
  if (event?.status === 'draft' && String(event.hostId) !== String(auth.userId)) throw new ServiceError(404, 'Event not found.');
  if (!event || !(await User.exists({ _id: event.hostId, deletedAt: null }))) {
    throw new ServiceError(404, 'Event not found.');
  }
  return event;
}

async function getRating(auth, eventId) {
  const event = await readEvent(auth, eventId);
  const selection = await EventSelection.findOne({ userId: auth.userId, eventId: event._id }).select('attending attended checkedInAt checkedInBy').lean();
  const rating = await EventRating.findOne({ userId: auth.userId, eventId: event._id }).lean();
  // Return an existing rating even after rescheduling/cancellation, while the
  // current eligibility flag controls whether the user can edit it now.
  return ratingResponse(event, rating, ratingEligibility(event, selection, auth.userId));
}

function parseScore(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'score') || !Number.isInteger(body.score) || !EVENT_RATING_SCORES.includes(body.score)) {
    throw new ServiceError(400, 'Choose a rating from 1 to 5.', { errors: { score: 'Choose one of the five ratings.' } });
  }
  return body.score;
}

async function putRating(auth, eventId, body) {
  requireEventId(eventId);
  const score = parseScore(body);
  const original = await findEventById(eventId, { select: '_id hostId' });
  if (!original?.hostId) throw new ServiceError(404, 'Event not found.');
  // Provision the unique index before the retryable transaction, never within it.
  await EventRating.init();
  try {
    return await withActiveAccountWrite(auth, [original.hostId], async session => {
      const event = await findEventById(eventId, { session, select: EVENT_FIELDS });
      if (!event) throw new ServiceError(404, 'Event not found.');
      const selection = await EventSelection.findOne({ userId: auth.userId, eventId: event._id })
        .select('attending attended checkedInAt checkedInBy').session(session).lean();
      const eligibility = ratingEligibility(event, selection, auth.userId);
      if (!eligibility.canRate) {
        const forbidden = String(event.hostId) === String(auth.userId) || !selection?.attending;
        throw new ServiceError(forbidden ? 403 : 409, eligibility.reason);
      }
      // Ownership comes exclusively from the authenticated context. The same
      // record is updated on later submissions, so counts cannot gain duplicates.
      const rating = await EventRating.findOneAndUpdate({ userId: auth.userId, eventId: event._id }, {
        $set: { score }, $setOnInsert: { userId: auth.userId, eventId: event._id },
      }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
      return ratingResponse(event, rating, eligibility);
    });
  } catch (error) {
    if (error.code === 11000) throw new ServiceError(409, 'Your rating changed. Please try again.');
    if (error.name === 'ValidationError') {
      throw new ServiceError(400, 'Choose a rating from 1 to 5.', { errors: { score: 'Choose one of the five ratings.' } });
    }
    throw error;
  }
}

async function getRatingSummary(auth, eventId) {
  const event = await readEvent(auth, eventId);
  if (String(event.hostId) !== String(auth.userId)) throw new ServiceError(403, 'Only this event’s organizer can view its rating summary.');
  if (!(event.endsAt instanceof Date) || !Number.isFinite(event.endsAt.getTime()) || event.endsAt > new Date()) {
    throw new ServiceError(409, 'Rating totals are available after this event ends.');
  }
  const totals = await EventRating.aggregate([
    { $match: { eventId: event._id, userId: { $ne: event.hostId } } },
    // Retain closed accounts' records, but use active accounts for audience totals.
    { $lookup: {
      from: User.collection.name, localField: 'userId', foreignField: '_id',
      pipeline: [{ $match: { deletedAt: null } }, { $project: { _id: 1 } }], as: 'activeAccount',
    } },
    { $match: { 'activeAccount.0': { $exists: true } } },
    // Existing votes remain stored. Ticketed-event totals only include verified
    // registrations, while ordinary events retain their existing rating rule.
    ...(event.useTickets ? [
      { $lookup: { from: EventSelection.collection.name, localField: 'userId', foreignField: 'userId',
        pipeline: [{ $match: { eventId: event._id, attending: true, attended: true } }, { $project: { _id: 1 } }], as: 'verifiedAttendance' } },
      { $match: { 'verifiedAttendance.0': { $exists: true } } },
    ] : []),
    { $group: { _id: '$score', count: { $sum: 1 } } },
  ]);
  const byScore = new Map(totals.map(row => [row._id, row.count]));
  const counts = EVENT_RATING_OPTIONS.map(option => ({ ...option, count: byScore.get(option.score) ?? 0 }));
  const totalRatings = counts.reduce((total, option) => total + option.count, 0);
  const weighted = counts.reduce((total, option) => total + option.score * option.count, 0);
  return { eventId: String(event._id), totalRatings, averageScore: totalRatings ? weighted / totalRatings : null, counts };
}

module.exports = { getRating, putRating, getRatingSummary, ratingEligibility };

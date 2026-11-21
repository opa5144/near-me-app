const mongoose = require('mongoose');
const Event = require('../models/Event');
const { collections, initializeEventModels, relocateEvent } = require('../models/eventStore');

function destination(event, now) {
  if (['cancelled', 'archived', 'draft'].includes(event.status)) return 'archived';
  if (event.status && event.status !== 'published') return null;
  const start = event.startsAt == null ? NaN : new Date(event.startsAt).getTime();
  const end = event.endsAt == null ? NaN : new Date(event.endsAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start < end && end <= now.getTime() ? 'past' : null;
}

// Preview performs reads only. The CLI uses this before any physical moves.
async function previewEventLifecycle({ now = new Date() } = {}) {
  const counts = { current: 0, past: 0, archived: 0, moveToPast: 0, moveToArchived: 0, invalidSchedule: 0, conflicts: 0 };
  const ids = new Set();
  for (const { model, storage } of collections) {
    const rows = await model.collection.find({}, { projection: { _id: 1, status: 1, startsAt: 1, endsAt: 1 } }).toArray();
    counts[storage] = rows.length;
    for (const row of rows) {
      const key = String(row._id);
      if (ids.has(key)) counts.conflicts++;
      ids.add(key);
      if (storage !== 'current') continue;
      const target = destination(row, now);
      if (target === 'past') counts.moveToPast++;
      if (target === 'archived') counts.moveToArchived++;
      if (!target && (!row.startsAt || !row.endsAt || !Number.isFinite(new Date(row.startsAt).getTime()) ||
          !Number.isFinite(new Date(row.endsAt).getTime()) || new Date(row.startsAt) >= new Date(row.endsAt) ||
          (row.status && row.status !== 'published'))) counts.invalidSchedule++;
    }
  }
  return counts;
}

// Bounded, repeatable transactions preserve original bytes/fields/timestamps.
// The original event delete conflicts with concurrent host edits; MongoDB retries
// and the due predicate is checked again before attempting the move.
async function reconcileEventLifecycle({ now = new Date(), limit = 100, shouldStop } = {}) {
  const summary = { scanned: 0, movedToPast: 0, movedToArchived: 0, skipped: 0 };
  const candidates = await Event.collection.find({ $or: [
    { status: { $in: ['cancelled', 'archived', 'draft'] } },
    { status: { $nin: ['cancelled', 'archived', 'draft'] }, startsAt: { $type: 'date' },
      endsAt: { $type: 'date', $lte: now }, $expr: { $lt: ['$startsAt', '$endsAt'] } },
  ] }, { projection: { _id: 1 } }).sort({ _id: 1 }).limit(Math.max(1, Math.min(500, limit))).toArray();
  for (const candidate of candidates) {
    if (shouldStop?.()) break;
    summary.scanned++;
    const moved = await mongoose.connection.transaction(async session => {
      const current = await Event.collection.findOne({ _id: candidate._id }, { session });
      if (!current) return null;
      const target = destination(current, now);
      if (!target) return null;
      await relocateEvent({ ...current, storage: 'current' }, target, session);
      return target;
    });
    if (moved === 'past') summary.movedToPast++;
    else if (moved === 'archived') summary.movedToArchived++;
    else summary.skipped++;
  }
  return summary;
}

module.exports = { initializeEventLifecycleModels: initializeEventModels, previewEventLifecycle, reconcileEventLifecycle };

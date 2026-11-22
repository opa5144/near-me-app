const mongoose = require('mongoose');

// Persistent, event-scoped failed manual-code attempts survive backend restarts.
// Only transient limiter state expires; attendance and ticket records do not.
const schema = new mongoose.Schema({
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  failedAttempts: { type: Number, min: 0, default: 0, required: true },
  windowStartedAt: { type: Date, required: true },
  blockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, collection: 'EventCheckInLimits' });
schema.index({ hostId: 1, eventId: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('EventCheckInLimit', schema);

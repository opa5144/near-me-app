const mongoose = require('mongoose');
const { NOTIFICATION_TYPES } = require('../constants/notificationTypes');

// Mongo-backed outbox/scheduler. Leases and retries survive process restarts.
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, maxlength: 128 },
  kind: { type: String, enum: ['notification', 'fanout', 'delivery', 'pushReceipt'], required: true },
  type: { type: String, enum: NOTIFICATION_TYPES },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dueAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, default: null },
  state: { type: String, enum: ['pending', 'processing', 'done', 'skipped', 'failed', 'blocked', 'unknown'], default: 'pending', required: true },
  attempts: { type: Number, min: 0, default: 0 },
  leaseOwner: { type: String, default: null, maxlength: 100 },
  leaseUntil: { type: Date, default: null },
  finishedAt: { type: Date, default: null },
  lastErrorCode: { type: String, default: null, maxlength: 100 },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, collection: 'notificationJobs' });
schema.index({ state: 1, dueAt: 1, leaseUntil: 1 });
module.exports = mongoose.model('NotificationJob', schema);

const mongoose = require('mongoose');
const { NOTIFICATION_TYPES, CHANNELS } = require('../constants/notificationTypes');

// One logical notification per recipient/occurrence. Read state is independent of delivery.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  type: { type: String, enum: NOTIFICATION_TYPES, required: true },
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 2000 },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  action: { type: mongoose.Schema.Types.Mixed, default: null },
  channels: {
    type: [{ type: String, enum: CHANNELS }], required: true, default: undefined,
    validate: value => Array.isArray(value) && value.length > 0 && new Set(value).size === value.length,
  },
  isRead: { type: Boolean, default: false, required: true },
  readAt: { type: Date, default: null },
  dedupeKey: { type: String, required: true, unique: true, maxlength: 128 },
  occurredAt: { type: Date, required: true },
}, { timestamps: true, collection: 'notifications' });
schema.index({ userId: 1, channels: 1, createdAt: -1, _id: -1 });
schema.index({ userId: 1, isRead: 1, channels: 1 });
module.exports = mongoose.model('Notification', schema);

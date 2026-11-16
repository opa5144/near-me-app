const mongoose = require('mongoose');
const { EXTERNAL_CHANNELS } = require('../constants/notificationTypes');

// Provider acceptance/receipt outcomes never change the notification's isRead value.
const schema = new mongoose.Schema({
  notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Friendship', default: null },
  channel: { type: String, enum: EXTERNAL_CHANNELS, required: true },
  destinationKey: { type: String, required: true, maxlength: 200 },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PushDevice', default: null },
  provider: { type: String, enum: ['resend', 'twilio', 'expo'], required: true },
  status: { type: String, enum: ['pending', 'sending', 'accepted', 'delivered', 'failed', 'skipped', 'unknown', 'blocked'], default: 'pending' },
  providerMessageId: { type: String, default: null, maxlength: 300 },
  firstAttemptAt: { type: Date, default: null },
  attemptedAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  receiptCheckedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  errorCode: { type: String, default: null, maxlength: 100 },
}, { timestamps: true, collection: 'notificationDeliveries' });
schema.index({ notificationId: 1, channel: 1, destinationKey: 1 }, { unique: true });
schema.index({ status: 1, updatedAt: 1 });
module.exports = mongoose.model('NotificationDelivery', schema);

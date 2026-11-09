const mongoose = require('mongoose');

// Defaults match the existing settings screen. These flags do not send messages.
const NOTIFICATION_DEFAULTS = Object.freeze({
  phoneMaster: true,
  emailMaster: true,
  calendarSync: false,
  personalizedEmail: true,
  cityEventsEmail: true,
  trendNewsletters: true,
  attendingEmailReminders: true,
  attendingPhoneReminders: true,
  bookingInterestEmail: true,
  topEventsEmail: true,
  organizerAnnounceEmail: true,
  organizerAnnouncePhone: true,
  followerEmail: true,
  followerPhone: true,
  newMessageEmail: true,
  newMessagePhone: true,
  hostEventLiveEmail: true,
  hostNewsletterEmail: true,
  hostNewCommentEmail: true,
});

const notificationSettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  settings: Object.fromEntries(Object.entries(NOTIFICATION_DEFAULTS).map(([field, value]) => [
    field, { type: Boolean, required: true, default: value },
  ])),
}, { timestamps: true, collection: 'NotificationSettings' });

module.exports = mongoose.model('NotificationSettings', notificationSettingsSchema);
module.exports.NOTIFICATION_DEFAULTS = NOTIFICATION_DEFAULTS;

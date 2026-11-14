const mongoose = require('mongoose');
const { NOTIFICATION_TYPES, CHANNELS } = require('../constants/notificationTypes');

// Retain the existing screen's choices; delivery also requires explicit channel opt-in.
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
const CHANNEL_DEFAULTS = Object.freeze({ inApp: true, push: false, email: false, sms: false });
const channelOverridesSchema = new mongoose.Schema(Object.fromEntries(CHANNELS.map(channel => [
  channel, { type: Boolean, default: undefined },
])), { _id: false });

const notificationSettingsSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  settings: Object.fromEntries(Object.entries(NOTIFICATION_DEFAULTS).map(([field, value]) => [
    field, { type: Boolean, required: true, default: value },
  ])),
  // Existing legacy email/SMS flags never opt an account into a new external channel.
  channels: {
    type: new mongoose.Schema(Object.fromEntries(Object.entries(CHANNEL_DEFAULTS).map(([channel, value]) => [
      channel, { type: Boolean, required: true, default: value },
    ])), { _id: false }),
    default: () => ({}),
  },
  typeChannels: {
    type: Map, of: channelOverridesSchema, default: () => ({}),
    validate: value => !value || [...value.keys()].every(type => NOTIFICATION_TYPES.includes(type)),
  },
}, { timestamps: true, collection: 'NotificationSettings' });

module.exports = mongoose.model('NotificationSettings', notificationSettingsSchema);
module.exports.NOTIFICATION_DEFAULTS = NOTIFICATION_DEFAULTS;
module.exports.CHANNEL_DEFAULTS = CHANNEL_DEFAULTS;

// Stable domain identifiers shared by schemas, policies, jobs, and preferences.
const NOTIFICATION_TYPES = Object.freeze([
  'REGISTRATION_CONFIRMED', 'REGISTRATION_CANCELLED', 'EVENT_STARTS_24H', 'EVENT_STARTS_1H',
  'EVENT_CANCELLED', 'EVENT_DATETIME_CHANGED', 'EVENT_LOCATION_CHANGED',
  'SAVED_EVENT_REGISTRATION_CLOSING', 'FOLLOWED_ORGANIZER_NEW_EVENT', 'RATE_ATTENDED_EVENT',
  'EVENT_INVITE',
]);
const CHANNELS = Object.freeze(['inApp', 'push', 'email', 'sms']);
const EXTERNAL_CHANNELS = Object.freeze(['push', 'email', 'sms']);
const TIMED_TYPES = Object.freeze([
  'EVENT_STARTS_24H', 'EVENT_STARTS_1H', 'SAVED_EVENT_REGISTRATION_CLOSING', 'RATE_ATTENDED_EVENT',
]);
const CHANNEL_PROVIDERS = Object.freeze({ push: 'expo', email: 'resend', sms: 'twilio' });
module.exports = { NOTIFICATION_TYPES, CHANNELS, EXTERNAL_CHANNELS, TIMED_TYPES, CHANNEL_PROVIDERS };

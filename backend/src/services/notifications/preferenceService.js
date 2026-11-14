const NotificationSettings = require('../../models/NotificationSettings');
const User = require('../../models/User');
const { NOTIFICATION_DEFAULTS, CHANNEL_DEFAULTS } = NotificationSettings;
const { NOTIFICATION_TYPES, CHANNELS } = require('../../constants/notificationTypes');
const { withActiveAccountWrite } = require('../activeAccountWrite');
const { ServiceError } = require('../serviceError');

const objectBody = value => value && typeof value === 'object' && !Array.isArray(value);
const valueAt = (value, key) => value instanceof Map ? value.get(key) : value?.[key];
const LEGACY_TYPE_FLAGS = Object.freeze({
  EVENT_STARTS_24H: { email: 'attendingEmailReminders', sms: 'attendingPhoneReminders' },
  EVENT_STARTS_1H: { email: 'attendingEmailReminders', sms: 'attendingPhoneReminders' },
  SAVED_EVENT_REGISTRATION_CLOSING: { email: 'bookingInterestEmail' },
  FOLLOWED_ORGANIZER_NEW_EVENT: { email: 'organizerAnnounceEmail', sms: 'organizerAnnouncePhone' },
});

function normalizePreferences(stored) {
  const settings = Object.fromEntries(Object.entries(NOTIFICATION_DEFAULTS).map(([key, fallback]) => [
    key, typeof valueAt(stored?.settings, key) === 'boolean' ? valueAt(stored.settings, key) : fallback,
  ]));
  const channels = Object.fromEntries(Object.entries(CHANNEL_DEFAULTS).map(([key, fallback]) => [
    key, typeof valueAt(stored?.channels, key) === 'boolean' ? valueAt(stored.channels, key) : fallback,
  ]));
  const typeChannels = {};
  for (const type of NOTIFICATION_TYPES) {
    const overrides = valueAt(stored?.typeChannels, type);
    const entries = CHANNELS.filter(channel => typeof valueAt(overrides, channel) === 'boolean')
      .map(channel => [channel, valueAt(overrides, channel)]);
    if (entries.length) typeChannels[type] = Object.fromEntries(entries);
  }
  return { settings, channels, typeChannels };
}

async function readPreferences(userId, { session } = {}) {
  const query = NotificationSettings.findOne({ userId }).lean();
  if (session) query.session(session);
  return normalizePreferences(await query);
}

function resolveChannels(stored, type) {
  if (!NOTIFICATION_TYPES.includes(type)) return [];
  const preferences = normalizePreferences(stored);
  return CHANNELS.filter(channel => {
    if (!preferences.channels[channel] || preferences.typeChannels[type]?.[channel] === false) return false;
    if (channel === 'email' && !preferences.settings.emailMaster) return false;
    if (channel === 'sms' && !preferences.settings.phoneMaster) return false;
    const legacy = LEGACY_TYPE_FLAGS[type]?.[channel];
    return !legacy || preferences.settings[legacy];
  });
}

function validatePatch(body) {
  if (!objectBody(body) || !Object.keys(body).length ||
      Object.keys(body).some(key => !['settings', 'channels', 'typeChannels'].includes(key))) {
    throw new ServiceError(400, 'Submit supported notification preferences only.');
  }
  for (const [key, allowed] of [['settings', Object.keys(NOTIFICATION_DEFAULTS)], ['channels', CHANNELS]]) {
    if (body[key] !== undefined && (!objectBody(body[key]) || Object.entries(body[key]).some(([field, value]) =>
      !allowed.includes(field) || typeof value !== 'boolean'))) {
      throw new ServiceError(400, 'Notification settings and channels must use supported boolean fields.');
    }
  }
  if (body.typeChannels !== undefined && (!objectBody(body.typeChannels) ||
      Object.keys(body.typeChannels).length > NOTIFICATION_TYPES.length || Object.entries(body.typeChannels).some(([type, channels]) =>
        !NOTIFICATION_TYPES.includes(type) || !objectBody(channels) || Object.keys(channels).length > CHANNELS.length ||
        Object.entries(channels).some(([channel, enabled]) => !CHANNELS.includes(channel) || typeof enabled !== 'boolean')))) {
    throw new ServiceError(400, 'Type overrides must use supported notification types, channels, and boolean choices.');
  }
}

async function getPreferences(auth) {
  if (!(await User.exists({ _id: auth.userId, deletedAt: null }))) throw new ServiceError(401, 'Please log in again.');
  return readPreferences(auth.userId);
}

async function updatePreferences(auth, body) {
  validatePatch(body);
  await NotificationSettings.init();
  return withActiveAccountWrite(auth, [], async session => {
    const current = await readPreferences(auth.userId, { session });
    const typeChannels = { ...current.typeChannels };
    for (const [type, overrides] of Object.entries(body.typeChannels ?? {})) {
      // An empty override object restores that type to its global channel choices.
      if (!Object.keys(overrides).length) delete typeChannels[type];
      else typeChannels[type] = { ...(typeChannels[type] ?? {}), ...overrides };
    }
    const saved = await NotificationSettings.findOneAndUpdate({ userId: auth.userId }, { $set: {
      settings: { ...current.settings, ...(body.settings ?? {}) },
      channels: { ...current.channels, ...(body.channels ?? {}) }, typeChannels,
    } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
    return normalizePreferences(saved);
  });
}

module.exports = { getPreferences, updatePreferences, readPreferences, resolveChannels, normalizePreferences };

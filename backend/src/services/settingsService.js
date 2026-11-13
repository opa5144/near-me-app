const { EVENT_CATEGORIES } = require('../constants/eventCategories');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const UserPreferences = require('../models/UserPreferences');
const NotificationSettings = require('../models/NotificationSettings');
const { NOTIFICATION_DEFAULTS } = NotificationSettings;
const { withActiveAccountWrite, ActiveAccountWriteError } = require('./activeAccountWrite');
const { validPlaceId, searchCities, fetchCity, displayCities } = require('./cityPreferences');
const { ServiceError } = require('./serviceError');

const categories = [...EVENT_CATEGORIES];
const categoryDefaults = () => Object.fromEntries(categories.map(category => [category, false]));

function plainCategories(value) {
  return Object.fromEntries(categories.map(category => [category,
    Boolean(value instanceof Map ? value.get(category) : value?.[category]),
  ]));
}

function objectBody(value) { return value && typeof value === 'object' && !Array.isArray(value); }

async function preferencesResponse(preferences, known) {
  return {
    categories,
    preferences: {
      categories: plainCategories(preferences?.categories),
      cities: await displayCities(preferences?.cities ?? [], known),
    },
  };
}

async function getCitySuggestions(query) {
  const input = typeof query === 'string' ? query.trim() : '';
  if (input.length < 3) return { cities: [] };
  if (input.length > 200) throw new ServiceError(400, 'Use 200 characters or fewer to search for a city.');
  return { cities: await searchCities(input) };
}

async function getPreferences(auth) {
  const preferences = await UserPreferences.findOne({ userId: auth.userId }).lean();
  return preferencesResponse(preferences);
}

async function updatePreferences(auth, body) {
  if (!objectBody(body) || !Object.keys(body).length || Object.keys(body).some(key => !['categories', 'cities'].includes(key))) {
    throw new ServiceError(400, 'Submit category or city preferences.');
  }
  if (body.categories !== undefined && (!objectBody(body.categories) || Object.entries(body.categories).some(([key, value]) => !categories.includes(key) || typeof value !== 'boolean'))) {
    throw new ServiceError(400, 'Category choices must be true or false for a supported event category.');
  }
  if (body.cities !== undefined && (!Array.isArray(body.cities) || body.cities.length > 100 || body.cities.some(city =>
    !objectBody(city) || !validPlaceId(city.placeId) || typeof city.subscribed !== 'boolean' ||
    Object.keys(city).some(key => !['placeId', 'subscribed'].includes(key))))) {
    throw new ServiceError(400, 'Choose up to 100 cities from the search results, with a true or false subscription.');
  }
  if (body.cities && new Set(body.cities.map(city => city.placeId)).size !== body.cities.length) {
    throw new ServiceError(400, 'Each city can only appear once.');
  }

  const existing = await UserPreferences.findOne({ userId: auth.userId }).lean();
  const knownIds = new Set((existing?.cities ?? []).map(city => city.placeId));
  const known = new Map();
  // Resolve provider data before a database transaction that MongoDB may retry.
  const lookups = await Promise.allSettled((body.cities ?? []).filter(city => !knownIds.has(city.placeId))
    .map(async city => { known.set(city.placeId, await fetchCity(city.placeId)); }));
  const failed = lookups.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  await UserPreferences.init();
  const saved = await withActiveAccountWrite(auth, [], async session => {
    const current = await UserPreferences.findOne({ userId: auth.userId }).session(session);
    const choices = { ...categoryDefaults(), ...plainCategories(current?.categories), ...(body.categories ?? {}) };
    return UserPreferences.findOneAndUpdate({ userId: auth.userId }, { $set: {
      categories: choices,
      cities: body.cities ?? (current?.cities ?? []).map(city => ({ placeId: city.placeId, subscribed: city.subscribed })),
    } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
  });
  return preferencesResponse(saved, known);
}

async function notificationResponse(userId, stored) {
  const account = await User.findOne({ _id: userId, deletedAt: null }).select('email').lean();
  if (!account) throw new ActiveAccountWriteError(401, 'Please log in again.');
  const profile = await UserProfile.findOne({ userId }).select('phone').lean();
  if (!profile) throw new ServiceError(503, 'Your account profile is unavailable. Please try again later.');
  return {
    settings: { ...NOTIFICATION_DEFAULTS, ...(stored?.settings ?? {}) },
    contacts: { email: account.email ?? '', phone: profile?.phone ?? '' },
  };
}

async function getNotifications(auth) {
  const stored = await NotificationSettings.findOne({ userId: auth.userId }).lean();
  return notificationResponse(auth.userId, stored);
}

async function updateNotifications(auth, body) {
  if (!objectBody(body) || Object.keys(body).some(key => key !== 'settings') ||
      !objectBody(body.settings) || !Object.keys(body.settings).length ||
      Object.entries(body.settings).some(([key, value]) =>
        !Object.prototype.hasOwnProperty.call(NOTIFICATION_DEFAULTS, key) || typeof value !== 'boolean')) {
    throw new ServiceError(400, 'Notification preferences must be true or false for a supported setting.');
  }
  await NotificationSettings.init();
  const stored = await withActiveAccountWrite(auth, [], async session => {
    const current = await NotificationSettings.findOne({ userId: auth.userId }).session(session).lean();
    return NotificationSettings.findOneAndUpdate({ userId: auth.userId }, { $set: {
      settings: { ...NOTIFICATION_DEFAULTS, ...(current?.settings ?? {}), ...body.settings },
    } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
  });
  return notificationResponse(auth.userId, stored);
}

module.exports = { getCitySuggestions, getPreferences, updatePreferences, getNotifications, updateNotifications };

const express = require('express');
const Event = require('../models/Event');
const User = require('../models/User');
const UserPreferences = require('../models/UserPreferences');
const NotificationSettings = require('../models/NotificationSettings');
const { NOTIFICATION_DEFAULTS } = NotificationSettings;
const { requireAuth } = require('../middleware/requireAuth');
const { withActiveAccountWrite, ActiveAccountWriteError } = require('../services/activeAccountWrite');
const { CityLookupError, validPlaceId, searchCities, fetchCity, displayCities } = require('../services/cityPreferences');

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const categories = [...Event.schema.path('category').enumValues];
const categoryDefaults = () => Object.fromEntries(categories.map(category => [category, false]));

function plainCategories(value) {
  return Object.fromEntries(categories.map(category => [category,
    Boolean(value instanceof Map ? value.get(category) : value?.[category]),
  ]));
}

function sendError(res, error) {
  if (error instanceof ActiveAccountWriteError || error instanceof CityLookupError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error('Settings request failed:', error.name);
  return res.status(500).json({ message: 'Unable to save or load your settings. Please try again.' });
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

router.get('/cities', async (req, res) => {
  const input = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (input.length < 3) return res.json({ cities: [] });
  if (input.length > 200) return res.status(400).json({ message: 'Use 200 characters or fewer to search for a city.' });
  try { return res.json({ cities: await searchCities(input) }); }
  catch (error) { return sendError(res, error); }
});

router.get('/preferences', async (req, res) => {
  try {
    const preferences = await UserPreferences.findOne({ userId: req.userId }).lean();
    return res.json(await preferencesResponse(preferences));
  } catch (error) { return sendError(res, error); }
});

router.patch('/preferences', async (req, res) => {
  try {
    const body = req.body;
    if (!objectBody(body) || !Object.keys(body).length || Object.keys(body).some(key => !['categories', 'cities'].includes(key))) {
      return res.status(400).json({ message: 'Submit category or city preferences.' });
    }
    if (body.categories !== undefined && (!objectBody(body.categories) || Object.entries(body.categories).some(([key, value]) => !categories.includes(key) || typeof value !== 'boolean'))) {
      return res.status(400).json({ message: 'Category choices must be true or false for a supported event category.' });
    }
    if (body.cities !== undefined && (!Array.isArray(body.cities) || body.cities.length > 100 || body.cities.some(city =>
      !objectBody(city) || !validPlaceId(city.placeId) || typeof city.subscribed !== 'boolean' ||
      Object.keys(city).some(key => !['placeId', 'subscribed'].includes(key))))) {
      return res.status(400).json({ message: 'Choose up to 100 cities from the search results, with a true or false subscription.' });
    }
    if (body.cities && new Set(body.cities.map(city => city.placeId)).size !== body.cities.length) {
      return res.status(400).json({ message: 'Each city can only appear once.' });
    }

    const existing = await UserPreferences.findOne({ userId: req.userId }).lean();
    const knownIds = new Set((existing?.cities ?? []).map(city => city.placeId));
    const known = new Map();
    // Validate new city IDs before opening a retryable database transaction.
    const lookups = await Promise.allSettled((body.cities ?? []).filter(city => !knownIds.has(city.placeId))
      .map(async city => { known.set(city.placeId, await fetchCity(city.placeId)); }));
    const failed = lookups.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    await UserPreferences.init();
    const saved = await withActiveAccountWrite(req, [], async session => {
      const current = await UserPreferences.findOne({ userId: req.userId }).session(session);
      const choices = { ...categoryDefaults(), ...plainCategories(current?.categories), ...(body.categories ?? {}) };
      return UserPreferences.findOneAndUpdate({ userId: req.userId }, { $set: {
        categories: choices,
        cities: body.cities ?? (current?.cities ?? []).map(city => ({ placeId: city.placeId, subscribed: city.subscribed })),
      } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
    });
    return res.json(await preferencesResponse(saved, known));
  } catch (error) { return sendError(res, error); }
});

async function notificationResponse(userId, stored) {
  const account = await User.findOne({ _id: userId, deletedAt: null }).select('email phone').lean();
  if (!account) throw new ActiveAccountWriteError(401, 'Please log in again.');
  return {
    settings: { ...NOTIFICATION_DEFAULTS, ...(stored?.settings ?? {}) },
    contacts: { email: account.email ?? '', phone: account.phone ?? '' },
  };
}

router.get('/notifications', async (req, res) => {
  try {
    const stored = await NotificationSettings.findOne({ userId: req.userId }).lean();
    return res.json(await notificationResponse(req.userId, stored));
  } catch (error) { return sendError(res, error); }
});

router.patch('/notifications', async (req, res) => {
  try {
    if (!objectBody(req.body) || Object.keys(req.body).some(key => key !== 'settings') ||
        !objectBody(req.body.settings) || !Object.keys(req.body.settings).length ||
        Object.entries(req.body.settings).some(([key, value]) =>
          !Object.prototype.hasOwnProperty.call(NOTIFICATION_DEFAULTS, key) || typeof value !== 'boolean')) {
      return res.status(400).json({ message: 'Notification preferences must be true or false for a supported setting.' });
    }
    await NotificationSettings.init();
    const stored = await withActiveAccountWrite(req, [], async session => {
      const current = await NotificationSettings.findOne({ userId: req.userId }).session(session).lean();
      return NotificationSettings.findOneAndUpdate({ userId: req.userId }, { $set: {
        settings: { ...NOTIFICATION_DEFAULTS, ...(current?.settings ?? {}), ...req.body.settings },
      } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }).lean();
    });
    return res.json(await notificationResponse(req.userId, stored));
  } catch (error) { return sendError(res, error); }
});

module.exports = router;

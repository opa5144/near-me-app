const mongoose = require('mongoose');
const Store = require('../models/Store');
const User = require('../models/User');
const { withActiveAccountWrite } = require('./activeAccountWrite');
const { resolvePhotos, photoItems, photoImage } = require('./photoData');
const { ServiceError } = require('./serviceError');

const { STORE_CATEGORIES, BUSINESS_DAYS } = Store;
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const OWNER_FIELDS = 'username firstName lastName';

function requireId(id, label) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id) || !mongoose.isObjectIdOrHexString(id)) {
    throw new ServiceError(400, `Invalid ${label} ID.`);
  }
}

function plainObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

function parseStore(body) {
  if (!plainObject(body)) throw new ServiceError(400, 'Please submit your store details.');
  const errors = {};
  const fields = {};
  for (const [field, label, maximum] of [
    ['name', 'Business name', 150], ['description', 'Description', 5000],
    ['address', 'Address', 500], ['place', 'Place name', 300],
  ]) {
    if (typeof body[field] !== 'string' || !body[field].trim()) errors[field] = `${label} is required.`;
    else if (body[field].trim().length > maximum) errors[field] = `Use ${maximum} characters or fewer.`;
    else fields[field] = body[field].trim();
  }

  if (!Array.isArray(body.categories) || !body.categories.length ||
      body.categories.some(category => typeof category !== 'string' || !STORE_CATEGORIES.includes(category.trim()))) {
    errors.categories = 'Choose at least one supported vendor category.';
  } else {
    fields.categories = body.categories.map(category => category.trim());
    if (new Set(fields.categories).size !== fields.categories.length) errors.categories = 'Each category can only appear once.';
  }

  if (typeof body.timeZone !== 'string' || !body.timeZone.trim() || body.timeZone.trim().length > 100) {
    errors.timeZone = 'Choose a valid business time zone.';
  } else {
    fields.timeZone = body.timeZone.trim();
    try { new Intl.DateTimeFormat('en-US', { timeZone: fields.timeZone }); }
    catch { errors.timeZone = 'Choose a valid business time zone.'; }
  }

  if (!Array.isArray(body.businessHours) || body.businessHours.length !== BUSINESS_DAYS.length ||
      body.businessHours.some(item => !plainObject(item) || !BUSINESS_DAYS.includes(item.day)) ||
      new Set(body.businessHours.map(item => item.day)).size !== BUSINESS_DAYS.length) {
    errors.businessHours = 'Provide exactly one opening-hours entry for each day of the week.';
  } else {
    fields.businessHours = BUSINESS_DAYS.map(day => {
      const item = body.businessHours.find(entry => entry.day === day);
      if (typeof item.isOpen !== 'boolean') errors.businessHours = 'Choose open or closed for every day.';
      else if (item.isOpen && (typeof item.opensAt !== 'string' || typeof item.closesAt !== 'string' ||
          !CLOCK_TIME.test(item.opensAt) || !CLOCK_TIME.test(item.closesAt) || item.opensAt === item.closesAt)) {
        errors.businessHours = 'Open days need different opening and closing times in HH:mm format.';
      } else if (!item.isOpen && (item.opensAt != null || item.closesAt != null)) {
        errors.businessHours = 'Closed days must not have opening or closing times.';
      }
      // Earlier closing times mean the following day, rather than an invalid interval.
      return { day, isOpen: item.isOpen, opensAt: item.isOpen ? item.opensAt : null, closesAt: item.isOpen ? item.closesAt : null };
    });
  }

  fields.placeId = null;
  if (body.placeId != null && body.placeId !== '') {
    if (typeof body.placeId !== 'string' || body.placeId.trim().length > 255) errors.placeId = 'Choose a valid place.';
    else fields.placeId = body.placeId.trim() || null;
  }
  for (const [field, minimum, maximum] of [['latitude', -90, 90], ['longitude', -180, 180]]) {
    fields[field] = body[field] ?? null;
    if (fields[field] !== null && (typeof fields[field] !== 'number' || !Number.isFinite(fields[field]) || fields[field] < minimum || fields[field] > maximum)) {
      errors[field] = `Choose a location with a valid ${field}.`;
    }
  }
  if ((fields.latitude === null) !== (fields.longitude === null)) {
    const message = 'Provide both latitude and longitude, or omit both.';
    errors.latitude = errors.latitude || message;
    errors.longitude = errors.longitude || message;
  }

  if (Object.keys(errors).length) throw new ServiceError(400, 'Please correct the highlighted store details.', { errors });
  // Decode and validate uploads outside the retryable account-write transaction.
  fields.photos = resolvePhotos(body.photos === undefined ? [] : body.photos, []);
  return fields;
}

function toStoreItem(store, baseUrl) {
  const owner = store.ownerId;
  const photos = photoItems(store, baseUrl, 'stores');
  return {
    id: String(store._id),
    ownerId: owner && typeof owner.username === 'string' ? {
      _id: String(owner._id), username: owner.username, firstName: owner.firstName, lastName: owner.lastName,
    } : String(owner),
    name: store.name, categories: store.categories, description: store.description,
    address: store.address, place: store.place,
    placeId: store.placeId || undefined, latitude: store.latitude ?? undefined, longitude: store.longitude ?? undefined,
    timeZone: store.timeZone,
    businessHours: store.businessHours.map(({ day, isOpen, opensAt, closesAt }) => ({ day, isOpen, opensAt, closesAt })),
    photos, bannerImage: photos[0]?.url,
    createdAt: store.createdAt, updatedAt: store.updatedAt,
  };
}

async function listPublicStores(baseUrl) {
  const stores = await Store.find({}).populate({ path: 'ownerId', select: OWNER_FIELDS, match: { deletedAt: null } })
    .sort({ createdAt: -1, _id: -1 }).lean();
  return stores.filter(store => store.ownerId).map(store => toStoreItem(store, baseUrl));
}

async function listOwnedStores(auth, baseUrl) {
  const stores = await Store.find({ ownerId: auth.userId }).populate({ path: 'ownerId', select: OWNER_FIELDS, match: { deletedAt: null } })
    .sort({ createdAt: -1, _id: -1 }).lean();
  return stores.filter(store => store.ownerId).map(store => toStoreItem(store, baseUrl));
}

async function getStore(id, baseUrl) {
  requireId(id, 'store');
  const store = await Store.findById(id).populate({ path: 'ownerId', select: OWNER_FIELDS, match: { deletedAt: null } }).lean();
  if (!store || !store.ownerId) throw new ServiceError(404, 'Store not found.');
  return toStoreItem(store, baseUrl);
}

async function getStorePhoto(id, photoId) {
  requireId(id, 'store');
  if (photoId !== undefined) requireId(photoId, 'photo');
  const store = await Store.findById(id).select('+photos.imageData').lean();
  if (!store || !(await User.exists({ _id: store.ownerId, deletedAt: null }))) return null;
  return photoImage(store, photoId);
}

async function createStore(auth, body, baseUrl) {
  try {
    const fields = parseStore(body);
    await Store.init();
    // The session is the only source of ownership. Closure locks the same account,
    // so no store can be published after its owner's account has been closed.
    return await withActiveAccountWrite(auth, [], async session => {
      const [created] = await Store.create([{ ...fields, ownerId: auth.userId }], { session });
      const store = await Store.findById(created._id).session(session).populate({
        path: 'ownerId', select: OWNER_FIELDS, match: { deletedAt: null }, options: { session },
      }).lean();
      if (!store || !store.ownerId) throw new ServiceError(404, 'Store not found.');
      return toStoreItem(store, baseUrl);
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      throw new ServiceError(400, 'Please check your store details.');
    }
    throw error;
  }
}

module.exports = { listPublicStores, listOwnedStores, getStore, getStorePhoto, createStore };

const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Store = require('../models/Store');
const StorePhoto = require('../models/StorePhoto');
const Event = require('../models/Event');
const EventSelection = require('../models/EventSelection');
const { STORE_CATEGORIES } = require('../constants/storeCategories');
const storeFixture = require('../../scripts/fixtures/store-population/stores.json');
const venueFixture = require('../../scripts/fixtures/category-demo/venues.json');
const categoryPhotos = require('../../scripts/fixtures/category-demo/photos.json');
const extraPhotos = require('../../scripts/fixtures/store-population/photos.json');

const PREFIX = 'store-history-v1';
const MINIMUM_ATTENDED = 10;
const RECIPIENT_IDS = ['6ae7814e7d5f88664b48dc90', '6ae7ad81d75d3755e55f82d3', '6aeb4f6c9b286ace01de1aea'];
const id = value => String(value?._id ?? value);
const time = value => value == null ? NaN : new Date(value).getTime();
const generation = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const stableId = key => new mongoose.Types.ObjectId(createHash('sha256').update(`${PREFIX}:${key}`).digest('hex').slice(0, 24));

class StoreHistoryPopulationError extends Error {
  constructor(message) { super(message); this.name = 'StoreHistoryPopulationError'; this.code = 'STORE_HISTORY_PRECONDITION'; }
}

function currentInstant(value) {
  const now = new Date(value);
  if (!Number.isFinite(now.getTime())) throw new StoreHistoryPopulationError('A valid current instant is required.');
  return now;
}

function weeklyHours(group) {
  return Store.BUSINESS_DAYS.map(day => {
    if (group.closedDays?.includes(day)) return { day, isOpen: false, opensAt: null, closesAt: null };
    const hours = day === 'Sunday' ? group.sundayHours : day === 'Saturday' ? group.saturdayHours
      : day === 'Friday' && group.fridayHours ? group.fridayHours : group.weekdayHours;
    return { day, isOpen: true, opensAt: hours[0], closesAt: hours[1] };
  });
}

// The source manifests identify stock/category images, not the premises of the
// configured store. Assets are pinned by hash and read locally, never fetched by
// an administrative transaction or while the app handles a request.
async function photoInventory() {
  const manifests = [
    { directory: path.resolve(__dirname, '../../scripts/fixtures/category-demo'), photos: categoryPhotos.photos },
    { directory: path.resolve(__dirname, '../../scripts/fixtures/store-population'), photos: extraPhotos.photos },
  ];
  const byCategory = new Map();
  for (const manifest of manifests) {
    for (const photo of manifest.photos) {
      const file = path.resolve(manifest.directory, photo.file);
      if (!file.startsWith(manifest.directory + path.sep)) throw new StoreHistoryPopulationError('A photo path leaves its fixture directory.');
      const data = await fs.readFile(file);
      if (!data.length || data.length > 1024 * 1024 || data[0] !== 0xff || data[1] !== 0xd8 ||
          createHash('sha256').update(data).digest('hex') !== photo.sha256.toLowerCase()) {
        throw new StoreHistoryPopulationError('A store image is missing, changed, or larger than the allowed JPEG limit.');
      }
      if (!byCategory.has(photo.category)) byCategory.set(photo.category, []);
      byCategory.get(photo.category).push({ id: photo.id, imageData: data, imageMimeType: 'image/jpeg', sourcePage: photo.sourcePage });
    }
  }
  return byCategory;
}

async function accounts(session) {
  const rows = await User.find({ _id: { $in: RECIPIENT_IDS }, deletedAt: null })
    .select('_id username createdAt').session(session ?? null).lean();
  if (rows.length !== RECIPIENT_IDS.length) throw new StoreHistoryPopulationError('One of the three requested accounts is unavailable.');
  return RECIPIENT_IDS.map(userId => rows.find(row => id(row) === userId));
}

async function configuredStores(owners, now) {
  if (storeFixture.groups.length !== STORE_CATEGORIES.length || new Set(storeFixture.groups.map(group => group.category)).size !== STORE_CATEGORIES.length ||
      STORE_CATEGORIES.some(category => !storeFixture.groups.some(group => group.category === category))) {
    throw new StoreHistoryPopulationError('The store fixture must cover every supported vendor category once.');
  }
  const photos = await photoInventory();
  const venues = new Map(venueFixture.venues.map(venue => [venue.key, venue]));
  const rows = [];
  for (const [categoryIndex, group] of storeFixture.groups.entries()) {
    if (group.names.length !== 5 || new Set(group.names).size !== 5) throw new StoreHistoryPopulationError('Each category must contain five distinct store names.');
    const categoryImages = photos.get(group.photoCategory) || [];
    if (categoryImages.length < 2) throw new StoreHistoryPopulationError('Each vendor category needs at least two real JPEG illustrations.');
    for (const [slot, name] of group.names.entries()) {
      const venue = venues.get(group.venueKeys[slot % group.venueKeys.length]);
      if (!venue?.address || !venue?.timeZone) throw new StoreHistoryPopulationError('A store has no verified venue/address mapping.');
      const owner = owners[(categoryIndex * 5 + slot) % owners.length];
      const seedKey = `${PREFIX}:${group.category.toLowerCase()}:${slot + 1}`;
      const row = { _id: stableId(seedKey), seedKey, ownerId: owner._id, name,
        categories: [group.category], description: group.description,
        address: venue.address, place: venue.place, placeId: venue.placeId || null,
        latitude: venue.latitude ?? null, longitude: venue.longitude ?? null, timeZone: venue.timeZone,
        businessHours: weeklyHours(group), createdAt: now, updatedAt: now };
      await new Store(row).validate();
      const imageRows = [categoryImages[slot % categoryImages.length], categoryImages[(slot + 1) % categoryImages.length]]
        .map((photo, displayOrder) => ({ storeId: row._id, imageData: photo.imageData, imageMimeType: photo.imageMimeType,
          displayOrder, createdAt: now, updatedAt: now }));
      for (const image of imageRows) await new StorePhoto(image).validate();
      rows.push({ row, photos: imageRows });
    }
  }
  if (new Set(rows.map(item => item.row.name)).size !== 45) throw new StoreHistoryPopulationError('Store names must remain distinct across all categories.');
  return rows;
}

function storeMatches(actual, expected) {
  return id(actual) === id(expected) && actual.seedKey === expected.seedKey && id(actual.ownerId) === id(expected.ownerId) &&
    actual.name === expected.name && actual.address === expected.address && Array.isArray(actual.categories) &&
    actual.categories.length === 1 && actual.categories[0] === expected.categories[0];
}

async function existingStores(planned, session) {
  const found = await Store.find({ $or: [
    { _id: { $in: planned.map(item => item.row._id) } },
    { seedKey: { $in: planned.map(item => item.row.seedKey) } },
    { name: { $in: planned.map(item => item.row.name) } },
  ] }).session(session ?? null).lean();
  const byKey = new Map();
  for (const row of found) {
    const item = planned.find(candidate => id(candidate.row) === id(row) || candidate.row.seedKey === row.seedKey || candidate.row.name === row.name);
    if (!item || !storeMatches(row, item.row) || byKey.has(row.seedKey)) {
      throw new StoreHistoryPopulationError('A reserved store identity is occupied or changed. Existing stores will not be overwritten.');
    }
    byKey.set(row.seedKey, row);
  }
  return byKey;
}

function validPast(event, now) {
  const closes = time(event.registrationClosesAt || event.startsAt);
  // Retain old preview fixtures, but use normal app events for these histories.
  const previewLabel = /^\[(?:history\s+)?(?:demo|test)\]/i.test(event.title || '');
  return !previewLabel && event.status !== 'cancelled' && Number.isFinite(time(event.startsAt)) && time(event.startsAt) < time(event.endsAt) &&
    time(event.endsAt) <= now.getTime() && Number.isFinite(closes) && closes <= time(event.startsAt);
}

async function historyPlan(owners, now, session) {
  const activeHosts = await User.find({ deletedAt: null }).select('_id').session(session ?? null).lean();
  const events = (await Event.find({ hostId: { $in: activeHosts.map(host => host._id) }, endsAt: { $lte: now }, status: { $ne: 'cancelled' } })
    .select('_id hostId title startsAt endsAt registrationClosesAt createdAt status')
    .sort({ endsAt: -1, _id: 1 }).session(session ?? null).lean()).filter(event => validPast(event, now));
  const choices = await EventSelection.find({ userId: { $in: owners.map(owner => owner._id) }, eventId: { $in: events.map(event => event._id) } })
    .session(session ?? null).lean();
  return owners.map(account => {
    const eligible = events.filter(event => id(event.hostId) !== id(account));
    const byEvent = new Map(choices.filter(row => id(row.userId) === id(account)).map(row => [id(row.eventId), row]));
    const attended = eligible.filter(event => byEvent.get(id(event))?.attending);
    const needed = Math.max(0, MINIMUM_ATTENDED - attended.length);
    // Physical attendance can precede joining the app. Import its history now,
    // without inventing an earlier signup or in-app registration timestamp.
    const available = eligible.filter(event => !byEvent.get(id(event))?.attending)
      .sort((left, right) => Number(Boolean(byEvent.get(id(right))?.interested)) - Number(Boolean(byEvent.get(id(left))?.interested)) ||
        time(right.endsAt) - time(left.endsAt) || id(left).localeCompare(id(right)));
    if (available.length < needed) throw new StoreHistoryPopulationError('An account has fewer than ten eligible other-host past events. No existing event dates will be changed.');
    return { account, attendedBefore: attended.length, events: available.slice(0, needed), existingSelections: byEvent };
  });
}

async function planPopulation(now) {
  const owners = await accounts();
  const planned = await configuredStores(owners, now);
  const existing = await existingStores(planned);
  const history = await historyPlan(owners, now);
  const missing = planned.filter(item => !existing.has(item.row.seedKey));
  const summary = { seed: PREFIX, storesPlannedTotal: 45, existingImportedStores: existing.size,
    storesToAdd: missing.length, storePhotosToAdd: missing.reduce((sum, item) => sum + item.photos.length, 0),
    categories: STORE_CATEGORIES.map(category => ({ category,
      storesToAdd: missing.filter(item => item.row.categories[0] === category).length,
      importedStoresAfter: planned.filter(item => item.row.categories[0] === category).length })),
    owners: owners.map(owner => ({ userId: id(owner), username: owner.username,
      storesToAdd: missing.filter(item => id(item.row.ownerId) === id(owner)).length,
      importedStoresAfter: planned.filter(item => id(item.row.ownerId) === id(owner)).length })),
    history: history.map(row => ({ userId: id(row.account), username: row.account.username,
      attendedPastBefore: row.attendedBefore, attendingRecordsToAdd: row.events.length,
      attendedPastAfter: row.attendedBefore + row.events.length,
      events: row.events.map(event => ({ eventId: id(event), title: event.title, endsAt: event.endsAt })) })),
    historyAttendanceToAdd: history.reduce((sum, row) => sum + row.events.length, 0),
    existingStoreRecordsChanged: 0, existingStorePhotosChanged: 0, eventMetadataChanged: 0, ratingsChanged: 0,
    historyRecording: 'Past attendance recorded now; no earlier in-app registration is invented.', registrationFactsCreated: 0,
    externalNotificationsSent: 0, photoPolicy: 'Real source-identified category illustrations; not premises photography.',
    hoursPolicy: 'Store-configured app hours; not independent official-venue opening-hour claims.' };
  return { now, owners, planned, existing, history, summary };
}

async function requireUniqueIndex(model, fields, { sparseAllowed = false } = {}) {
  const indexes = await model.collection.listIndexes().toArray();
  if (!indexes.some(index => index.unique && !index.partialFilterExpression && (!index.sparse || sparseAllowed) &&
      Object.keys(index.key).length === fields.length && fields.every(field => index.key[field] === 1))) {
    throw new StoreHistoryPopulationError(`Provision the required unique index on ${model.collection.name} (${fields.join(', ')}) before applying.`);
  }
}

// Index provisioning is explicitly separate from the read-only preview.
async function provisionStoreHistoryIndexes() {
  await Store.collection.createIndex({ seedKey: 1 }, { unique: true, sparse: true, name: 'seedKey_1' });
  await requireUniqueIndex(StorePhoto, ['storeId', 'displayOrder']);
  await requireUniqueIndex(EventSelection, ['userId', 'eventId']);
}

async function withAccounts(accountIds, write) {
  const ids = [...new Set(accountIds.map(id))].sort();
  return mongoose.connection.transaction(async session => {
    const locked = await User.bulkWrite(ids.map(accountId => ({ updateOne: { filter: { _id: accountId, deletedAt: null },
      update: { $inc: { archiveWriteVersion: 1 } }, timestamps: false } })), { session, ordered: true, timestamps: false });
    if (locked.matchedCount !== ids.length) throw new StoreHistoryPopulationError('An account became unavailable. Preview the population again.');
    return write(session);
  });
}

async function populateStores(plan) {
  let storesAdded = 0; let photosAdded = 0;
  for (const item of plan.planned) {
    const result = await withAccounts([item.row.ownerId], async session => {
      const current = await existingStores([item], session);
      if (current.has(item.row.seedKey)) return { stores: 0, photos: 0 };
      await Store.create([item.row], { session });
      await StorePhoto.insertMany(item.photos, { session });
      return { stores: 1, photos: item.photos.length };
    });
    storesAdded += result.stores; photosAdded += result.photos;
  }
  return { storesAdded, photosAdded };
}

async function populateHistory(owners, now) {
  const rows = await historyPlan(owners, now);
  const result = [];
  for (const planned of rows) {
    const added = await withAccounts([planned.account._id, ...planned.events.map(event => event.hostId)], async session => {
      let count = 0;
      for (const expected of planned.events) {
        const event = await Event.findOne({ _id: expected._id, hostId: expected.hostId }).session(session).lean();
        if (!event || !validPast(event, now)) throw new StoreHistoryPopulationError('A selected historical event changed. Preview again.');
        const before = await EventSelection.findOne({ userId: planned.account._id, eventId: event._id }).session(session).lean();
        if (before?.attending) continue;
        // This explicit historical import records attendance only. It does not
        // bypass the public endpoint's past-event read-only rule or enqueue old
        // registration/reminder messages as though a new live action occurred.
        await EventSelection.updateOne({ userId: planned.account._id, eventId: event._id }, { $set: {
          interested: Boolean(before?.interested), attending: true,
          registrationVersion: generation(before?.registrationVersion) + 1,
          selectionVersion: generation(before?.selectionVersion), registeredAt: before?.registeredAt || null,
          historyRecordedAt: now, cancelledAt: null,
          savedAt: before?.savedAt || null, updatedAt: now,
        }, $setOnInsert: { userId: planned.account._id, eventId: event._id, createdAt: now } },
        { session, upsert: true, runValidators: true, timestamps: false });
        count++;
      }
      return count;
    });
    result.push({ userId: id(planned.account), username: planned.account.username, attendanceAdded: added });
  }
  return result;
}

async function previewStoreHistoryPopulation({ now = new Date() } = {}) {
  return (await planPopulation(currentInstant(now))).summary;
}

async function populateStoreHistory({ now = new Date() } = {}) {
  const current = currentInstant(now);
  const plan = await planPopulation(current);
  await requireUniqueIndex(Store, ['seedKey'], { sparseAllowed: true });
  await requireUniqueIndex(StorePhoto, ['storeId', 'displayOrder']);
  await requireUniqueIndex(EventSelection, ['userId', 'eventId']);
  const stores = await populateStores(plan);
  const history = await populateHistory(plan.owners, current);
  const after = await planPopulation(current);
  if (after.summary.storesToAdd || after.summary.historyAttendanceToAdd) throw new StoreHistoryPopulationError('Population is incomplete after concurrent changes. Preview again to resume without overwriting records.');
  return { applied: true, seed: PREFIX, storesAdded: stores.storesAdded, storePhotosAdded: stores.photosAdded,
    historyAttendanceAdded: history.reduce((sum, row) => sum + row.attendanceAdded, 0), recipients: history,
    owners: after.summary.owners, categories: after.summary.categories, history: after.summary.history,
    existingStoreRecordsChanged: 0, existingStorePhotosChanged: 0, eventMetadataChanged: 0,
    ratingsChanged: 0, registrationFactsCreated: 0,
    historyRecording: 'Past attendance recorded now; no earlier in-app registration is invented.', externalNotificationsSent: 0 };
}

module.exports = { previewStoreHistoryPopulation, populateStoreHistory, provisionStoreHistoryIndexes, StoreHistoryPopulationError };

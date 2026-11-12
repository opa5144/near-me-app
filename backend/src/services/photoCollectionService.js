const EventPhoto = require('../models/EventPhoto');
const StorePhoto = require('../models/StorePhoto');
const { resolvePhotos, photoImage } = require('./photoData');

const COLLECTIONS = {
  event: { model: EventPhoto, parentField: 'eventId' },
  store: { model: StorePhoto, parentField: 'storeId' },
};

function configuration(kind) {
  const config = COLLECTIONS[kind];
  if (!config) throw new Error('Unknown photo collection.');
  return config;
}

// One metadata query serves an entire list/history response without fetching bytes.
async function loadPhotoMetadata(kind, parentIds, session) {
  const { model, parentField } = configuration(kind);
  const ids = [...new Set(parentIds.map(String))];
  const grouped = new Map();
  if (!ids.length) return grouped;
  const query = model.find({ [parentField]: { $in: ids } })
    .select(`_id ${parentField} displayOrder`).sort({ displayOrder: 1, _id: 1 });
  if (session) query.session(session);
  const photos = await query.lean();
  for (const photo of photos) {
    const id = String(photo[parentField]);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(photo);
  }
  return grouped;
}

async function getResourcePhotoImage(kind, parentId, photoId) {
  const { model, parentField } = configuration(kind);
  const photo = await model.findOne({ [parentField]: parentId, ...(photoId === undefined ? {} : { _id: photoId }) })
    .select('+imageData').sort({ displayOrder: 1, _id: 1 }).lean();
  return photoImage(photo);
}

// Call only after the resource owner's account fence has been acquired. Retention
// is resolved against that parent's collection, never against client-supplied IDs alone.
async function replaceResourcePhotos(kind, parentId, input, session) {
  if (!session?.inTransaction()) throw new Error('Photo writes require an active database transaction.');
  const { model, parentField } = configuration(kind);
  const existing = await model.find({ [parentField]: parentId }).select('+imageData')
    .sort({ displayOrder: 1, _id: 1 }).session(session).lean();
  const desired = resolvePhotos(input, existing);
  const now = new Date();
  const rows = desired.map((photo, displayOrder) => ({
    _id: photo._id, [parentField]: parentId,
    imageData: photo.imageData, imageMimeType: photo.imageMimeType, displayOrder,
    createdAt: photo.createdAt ?? now, updatedAt: photo.updatedAt ?? now,
  }));
  // Free the parent's bounded unique slots first, then reinsert the complete order
  // atomically. Retained photos keep their IDs, bytes and original timestamps.
  await model.deleteMany({ [parentField]: parentId }).session(session);
  if (rows.length) await model.insertMany(rows, { session, ordered: true, timestamps: false });
  return rows;
}

module.exports = { loadPhotoMetadata, getResourcePhotoImage, replaceResourcePhotos };

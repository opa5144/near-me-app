const mongoose = require('mongoose');
const { ServiceError } = require('./serviceError');

const MAX_PHOTOS = 5;
const MAX_IMAGE_BYTES = 1024 * 1024;

function decodeJpeg(value) {
  if (typeof value !== 'string' || !value) {
    throw new ServiceError(400, 'Please select a valid JPEG photo.');
  }
  if (value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    throw new ServiceError(413, 'Each JPEG photo must be no larger than 1 MiB.');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new ServiceError(400, 'Please select a valid JPEG photo.');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_IMAGE_BYTES) throw new ServiceError(413, 'Each JPEG photo must be no larger than 1 MiB.');
  // Signature and canonical Base64 checks screen uploads; the mobile picker creates the actual JPEG.
  if (bytes.toString('base64') !== value || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new ServiceError(400, 'Please select a valid JPEG photo.');
  }
  return bytes;
}

function validatePhotoInput(input) {
  if (!Array.isArray(input) || input.length > MAX_PHOTOS) {
    throw new ServiceError(400, 'Choose up to five photos in the order you want to display them.');
  }
  const retained = new Set();
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length !== 1) {
      throw new ServiceError(400, 'Each photo must contain a saved photo ID or a new JPEG image.');
    }
    if (Object.prototype.hasOwnProperty.call(item, 'id')) {
      if (typeof item.id !== 'string' || (item.id !== 'legacy' && !/^[a-f0-9]{24}$/i.test(item.id))) {
        throw new ServiceError(400, 'Choose a valid saved photo.');
      }
      const key = item.id.toLowerCase();
      if (retained.has(key)) throw new ServiceError(400, 'Each saved photo can appear only once.');
      retained.add(key);
    } else if (Object.prototype.hasOwnProperty.call(item, 'imageBase64')) {
      decodeJpeg(item.imageBase64);
    } else {
      throw new ServiceError(400, 'Each photo must contain a saved photo ID or a new JPEG image.');
    }
  }
  return input;
}

function imageBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  // Lean MongoDB reads may retain BSON Binary wrappers instead of Mongoose Buffers.
  if (value?._bsontype === 'Binary' && typeof value.value === 'function') {
    const bytes = value.value(true);
    if (Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) return Buffer.from(bytes);
  }
  return null;
}

function storedPhoto(photo) {
  const bytes = imageBytes(photo?.imageData);
  if (!bytes?.length || photo.imageMimeType !== 'image/jpeg') {
    throw new ServiceError(400, 'A saved photo is unavailable. Remove it and choose another photo.');
  }
  if (bytes.length > MAX_IMAGE_BYTES) throw new ServiceError(413, 'Each JPEG photo must be no larger than 1 MiB.');
  return { _id: photo._id, imageData: bytes, imageMimeType: 'image/jpeg' };
}

function resolvePhotos(input, existingPhotos = [], legacy) {
  validatePhotoInput(input);
  const saved = new Map((existingPhotos ?? []).map(photo => [String(photo._id).toLowerCase(), photo]));
  return input.map(item => {
    if (Object.prototype.hasOwnProperty.call(item, 'imageBase64')) {
      return { _id: new mongoose.Types.ObjectId(), imageData: decodeJpeg(item.imageBase64), imageMimeType: 'image/jpeg' };
    }
    if (item.id === 'legacy') {
      // Legacy retention is allowed only before a resource has an explicit photo collection.
      if (!legacy || Array.isArray(legacy.photos) || saved.size) {
        throw new ServiceError(400, 'This saved photo does not belong to this item.');
      }
      return storedPhoto({
        _id: new mongoose.Types.ObjectId(), imageData: legacy.imageData, imageMimeType: legacy.imageMimeType,
      });
    }
    const photo = saved.get(item.id.toLowerCase());
    if (!photo) throw new ServiceError(400, 'This saved photo does not belong to this item.');
    return storedPhoto(photo);
  });
}

function photoItems(resource, baseUrl, resourcePath) {
  const root = baseUrl.replace(/\/$/, '') + '/' + resourcePath + '/' + resource._id;
  if (Array.isArray(resource.photos)) {
    return resource.photos.filter(photo => photo?._id).map(photo => ({
      id: String(photo._id), url: root + '/photos/' + photo._id,
    }));
  }
  // An explicit empty array suppresses this fallback, even if an old image field still exists.
  return resource.imageMimeType ? [{ id: 'legacy', url: root + '/image' }] : [];
}

function photoImage(resource, photoId) {
  if (Array.isArray(resource.photos)) {
    const photo = photoId === undefined ? resource.photos[0]
      : resource.photos.find(item => String(item._id).toLowerCase() === String(photoId).toLowerCase());
    const bytes = imageBytes(photo?.imageData);
    return bytes?.length && photo.imageMimeType ? { data: bytes, mimeType: photo.imageMimeType } : null;
  }
  if (photoId !== undefined && photoId !== 'legacy') return null;
  const bytes = imageBytes(resource.imageData);
  return bytes?.length && resource.imageMimeType ? { data: bytes, mimeType: resource.imageMimeType } : null;
}

module.exports = { MAX_PHOTOS, MAX_IMAGE_BYTES, validatePhotoInput, resolvePhotos, photoItems, photoImage };

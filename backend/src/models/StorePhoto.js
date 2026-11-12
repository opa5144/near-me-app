const mongoose = require('mongoose');

// Staged only: existing store/photo storage stays unchanged until a later rollout.
const storePhotoSchema = new mongoose.Schema({
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
  imageData: {
    type: Buffer, required: true, select: false,
    validate: {
      validator: value => Boolean(value) && value.length > 0 && value.length <= 1024 * 1024,
      message: 'Each photo must be no larger than 1 MiB.',
    },
  },
  imageMimeType: { type: String, required: true, enum: ['image/jpeg'], default: 'image/jpeg' },
  displayOrder: {
    type: Number, required: true, min: 0, max: 4,
    validate: { validator: Number.isInteger, message: 'Photo display order must be an integer from 0 to 4.' },
  },
}, { timestamps: true, collection: 'StorePhotos', autoCreate: false, autoIndex: false });

// Pending explicit index creation: five bounded, unique slots limit each store
// to five photos only after this index is built. No count query belongs here.
storePhotoSchema.index({ storeId: 1, displayOrder: 1 }, { unique: true });

module.exports = mongoose.model('StorePhoto', storePhotoSchema);

const mongoose = require('mongoose');

// Active event media is stored separately from the untouched eventList metadata.
const eventPhotoSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
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
}, { timestamps: true, collection: 'EventPhotos', autoCreate: false, autoIndex: false });

// The rollout provisions this index explicitly; application startup must not create it.
// Five bounded unique slots limit each event without an unsafe count query.
eventPhotoSchema.index({ eventId: 1, displayOrder: 1 }, { unique: true });

module.exports = mongoose.model('EventPhoto', eventPhotoSchema);

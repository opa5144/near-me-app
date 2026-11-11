const mongoose = require('mongoose');

// Embedded photo IDs belong to one resource. Image bytes stay out of ordinary reads.
const photoSchema = new mongoose.Schema({
  imageData: {
    type: Buffer, required: true, select: false,
    validate: {
      validator: value => Boolean(value) && value.length > 0 && value.length <= 1024 * 1024,
      message: 'Each photo must be no larger than 1 MiB.',
    },
  },
  imageMimeType: { type: String, required: true, enum: ['image/jpeg'], default: 'image/jpeg' },
}, { _id: true, id: false });

module.exports = photoSchema;

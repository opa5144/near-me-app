const mongoose = require('mongoose');
const { EVENT_CATEGORIES } = require('../constants/eventCategories');

// Store each event in eventList, with a User reference identifying its host.
// Dates are absolute instants; timeZone controls how those instants appear to viewers.
const eventSchema = new mongoose.Schema({
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 150 },
  categories: {
    type: [{ type: String, enum: EVENT_CATEGORIES }], required: true, default: undefined,
    validate: {
      validator: values => Array.isArray(values) && values.length >= 1 &&
        values.length <= EVENT_CATEGORIES.length && new Set(values).size === values.length,
      message: 'Choose one or more supported categories without duplicates.',
    },
  },
  // Recognize older documents during the migration. New API writes use categories.
  category: { type: String, enum: EVENT_CATEGORIES },
  price: { type: Number, required: true, min: 0 },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  timeZone: { type: String, required: true },
  address: { type: String, required: true, trim: true, maxlength: 500 },
  place: { type: String, required: true, trim: true, maxlength: 300 },
  description: { type: String, required: true, trim: true, maxlength: 10000 },
  placeId: { type: String, default: null },
  latitude: { type: Number, default: null, min: -90, max: 90 },
  longitude: { type: Number, default: null, min: -180, max: 180 },
  // Photos are separate EventPhotos records; eventList stores event metadata only.
  emoji: { type: String, default: '🎟️' },
  accent: { type: String, default: '#6549EF' },
  seedKey: { type: String },
}, { timestamps: true, collection: 'eventList' });

// Demo records have stable, unique seed keys; sparse permits normal events with no seed key.
eventSchema.index({ seedKey: 1 }, { unique: true, sparse: true });
// Index the schedule field for database queries that select events by start time.
eventSchema.index({ startsAt: 1 });
// Public discovery filters out events whose end instant has already passed.
eventSchema.index({ endsAt: 1 });

module.exports = mongoose.model('Event', eventSchema);

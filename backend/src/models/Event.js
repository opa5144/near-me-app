const mongoose = require('mongoose');
const { EVENT_CATEGORIES } = require('../constants/eventCategories');
const requiredPublished = function () { return this.status !== 'draft'; };

// Store each event in eventList, with a User reference identifying its host.
// Dates are absolute instants; timeZone controls how those instants appear to viewers.
const eventSchema = new mongoose.Schema({
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: requiredPublished, trim: true, maxlength: 150, default: '' },
  categories: {
    type: [{ type: String, enum: EVENT_CATEGORIES }], default: [],
    validate: {
      validator: function (values) { return Array.isArray(values) && (this.status === 'draft' || values.length >= 1) &&
        values.length <= EVENT_CATEGORIES.length && new Set(values).size === values.length;
      },
      message: 'Choose one or more supported categories without duplicates.',
    },
  },
  // Recognize older documents during the migration. New API writes use categories.
  category: { type: String, enum: EVENT_CATEGORIES },
  price: { type: Number, required: requiredPublished, min: 0, default: 0 },
  // Old events remain ordinary registration events unless a host opts into tickets.
  useTickets: { type: Boolean, default: false, required: true },
  startsAt: { type: Date, required: requiredPublished, default: null },
  endsAt: { type: Date, required: requiredPublished, default: null },
  // Missing status on older records means published. Cancellation retains history.
  status: { type: String, enum: ['published', 'cancelled', 'archived', 'draft'], default: 'published', required: true },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, trim: true, maxlength: 500, default: '' },
  archivedAt: { type: Date, default: null },
  archiveReason: { type: String, trim: true, maxlength: 500, default: '' },
  sourceEventId: { type: mongoose.Schema.Types.ObjectId, default: null },
  notificationVersion: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  // Null/absent deadlines follow endsAt, allowing ongoing event registration.
  registrationClosesAt: { type: Date, default: null },
  timeZone: { type: String, required: requiredPublished, default: '' },
  address: { type: String, required: requiredPublished, trim: true, maxlength: 500, default: '' },
  place: { type: String, required: requiredPublished, trim: true, maxlength: 300, default: '' },
  description: { type: String, required: requiredPublished, trim: true, maxlength: 10000, default: '' },
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
eventSchema.index({ status: 1, endsAt: 1 });

module.exports = mongoose.model('Event', eventSchema);

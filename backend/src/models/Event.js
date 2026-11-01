const mongoose = require('mongoose');

// Store each event in eventList, with a User reference identifying its host.
// Dates are absolute instants; timeZone controls how those instants appear to viewers.
const eventSchema = new mongoose.Schema({
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 150 },
  category: { type: String, required: true, enum: ['Music', 'Dance', 'Food', 'Film', 'Workshop', 'Art'] },
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
  // Image bytes stay out of normal event queries and are fetched by the image endpoint.
  imageData: { type: Buffer, select: false },
  imageMimeType: { type: String, enum: ['image/jpeg', null], default: null },
  emoji: { type: String, default: '🎟️' },
  accent: { type: String, default: '#6549EF' },
  seedKey: { type: String },
}, { timestamps: true, collection: 'eventList' });

// Demo records have stable, unique seed keys; sparse permits normal events with no seed key.
eventSchema.index({ seedKey: 1 }, { unique: true, sparse: true });
// Index the schedule field for database queries that select events by start time.
eventSchema.index({ startsAt: 1 });

module.exports = mongoose.model('Event', eventSchema);

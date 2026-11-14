const mongoose = require('mongoose');
const { EVENT_RATING_SCORES } = require('../constants/eventRatings');

// Ratings remain attached to the original account/event when an event is edited.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  score: {
    type: Number, required: true, enum: EVENT_RATING_SCORES, min: 1, max: 5,
    validate: { validator: Number.isInteger, message: 'Choose a whole-number rating from 1 to 5.' },
  },
}, { timestamps: true, collection: 'eventRatings' });

schema.index({ userId: 1, eventId: 1 }, { unique: true });
schema.index({ eventId: 1, score: 1 });

module.exports = mongoose.model('EventRating', schema);

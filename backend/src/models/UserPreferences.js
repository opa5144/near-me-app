const mongoose = require('mongoose');

const cityPreferenceSchema = new mongoose.Schema({
  // Place IDs identify cities globally; names are resolved fresh for display.
  placeId: { type: String, required: true, maxlength: 255 },
  subscribed: { type: Boolean, required: true, default: false },
}, { _id: false });

const userPreferencesSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  categories: { type: Map, of: Boolean, default: () => ({}) },
  cities: {
    type: [cityPreferenceSchema], default: [],
    validate: { validator: value => value.length <= 100, message: 'Save up to 100 city choices.' },
  },
}, { timestamps: true, collection: 'UserPreferences' });

module.exports = mongoose.model('UserPreferences', userPreferencesSchema);

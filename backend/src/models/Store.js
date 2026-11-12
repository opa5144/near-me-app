const mongoose = require('mongoose');

const STORE_CATEGORIES = ['Music', 'Dance', 'Food', 'Film', 'Workshop', 'Art'];
const BUSINESS_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const businessHoursSchema = new mongoose.Schema({
  day: { type: String, required: true, enum: BUSINESS_DAYS },
  isOpen: { type: Boolean, required: true },
  opensAt: {
    type: String, default: null,
    validate: {
      validator(value) { return this.isOpen ? CLOCK_TIME.test(value ?? '') : value == null; },
      message: 'Open days need an opening time in HH:mm; closed days must use null.',
    },
  },
  closesAt: {
    type: String, default: null,
    validate: {
      validator(value) { return this.isOpen ? CLOCK_TIME.test(value ?? '') && value !== this.opensAt : value == null; },
      message: 'Open days need a different closing time in HH:mm; closed days must use null.',
    },
  },
}, { _id: false });

const storeSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 150 },
  categories: {
    type: [{ type: String, enum: STORE_CATEGORIES }], required: true,
    validate: {
      validator: values => Array.isArray(values) && values.length > 0 && new Set(values).size === values.length,
      message: 'Choose at least one category without duplicates.',
    },
  },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  address: { type: String, required: true, trim: true, maxlength: 500 },
  place: { type: String, required: true, trim: true, maxlength: 300 },
  placeId: { type: String, default: null, maxlength: 255 },
  latitude: { type: Number, default: null, min: -90, max: 90 },
  longitude: { type: Number, default: null, min: -180, max: 180 },
  timeZone: {
    type: String, required: true, trim: true, maxlength: 100,
    validate: {
      validator(value) {
        try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; }
        catch { return false; }
      },
      message: 'Choose a valid business time zone.',
    },
  },
  businessHours: {
    type: [businessHoursSchema], required: true,
    validate: {
      validator: hours => Array.isArray(hours) && hours.length === BUSINESS_DAYS.length &&
        new Set(hours.map(item => item.day)).size === BUSINESS_DAYS.length &&
        BUSINESS_DAYS.every(day => hours.some(item => item.day === day)),
      message: 'Provide exactly one opening-hours entry for each day of the week.',
    },
  },
  // Photos are separate StorePhotos records; StoreList stores store metadata only.
}, { timestamps: true, collection: 'StoreList' });

storeSchema.index({ createdAt: -1, _id: -1 });

const Store = mongoose.model('Store', storeSchema);
module.exports = Store;
module.exports.STORE_CATEGORIES = STORE_CATEGORIES;
module.exports.BUSINESS_DAYS = BUSINESS_DAYS;

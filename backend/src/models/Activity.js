const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: String,
  category: [{ type: String }],
  cost: { type: Number, required: true },
  location: {
    address: String,
    coordinates: { type: [Number], index: '2dsphere' },
  },
  timeSlots: [{ startTime: Date, endTime: Date }],
}, { timestamps: true });

module.exports = mongoose.model('Activity', activitySchema);

const mongoose = require('mongoose');

// Directed following is separate from the application's mutual friendships.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  organizerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  active: { type: Boolean, default: true },
  followedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, collection: 'organizerFollows' });
schema.index({ userId: 1, organizerId: 1 }, { unique: true });
schema.index({ organizerId: 1, active: 1 });
module.exports = mongoose.model('OrganizerFollow', schema);

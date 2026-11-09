const mongoose = require('mongoose');

// Interest and attendance are independent choices belonging to one account and event.
const eventSelectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  interested: { type: Boolean, default: false, required: true },
  attending: { type: Boolean, default: false, required: true },
}, { timestamps: true, collection: 'EventSelections' });

eventSelectionSchema.index({ userId: 1, eventId: 1 }, { unique: true });
// Both branches of the selected-events query start with the authenticated owner.
eventSelectionSchema.index({ userId: 1, interested: 1 });
eventSelectionSchema.index({ userId: 1, attending: 1 });

module.exports = mongoose.model('EventSelection', eventSelectionSchema);

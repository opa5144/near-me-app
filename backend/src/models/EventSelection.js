const mongoose = require('mongoose');

// Interest and attendance are independent choices belonging to one account and event.
const eventSelectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  interested: { type: Boolean, default: false, required: true },
  attending: { type: Boolean, default: false, required: true },
  // Each transition has a generation, so cancel/re-register can notify again
  // while retries of the same saved choice cannot create duplicate notifications.
  registrationVersion: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  selectionVersion: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
  registeredAt: { type: Date, default: null },
  // A past attendance can be imported after signup without claiming an earlier
  // in-app registration. Its recording time is separate from registeredAt.
  historyRecordedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  savedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'EventSelections' });

eventSelectionSchema.index({ userId: 1, eventId: 1 }, { unique: true });
// Both branches of the selected-events query start with the authenticated owner.
eventSelectionSchema.index({ userId: 1, interested: 1 });
eventSelectionSchema.index({ userId: 1, attending: 1 });

module.exports = mongoose.model('EventSelection', eventSelectionSchema);

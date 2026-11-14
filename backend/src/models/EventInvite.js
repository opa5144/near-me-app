const mongoose = require('mongoose');

const EventInviteSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

EventInviteSchema.index({ eventId: 1, senderId: 1, recipientId: 1 }, { unique: true });

module.exports = mongoose.model('EventInvite', EventInviteSchema);
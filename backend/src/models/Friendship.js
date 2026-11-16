const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'blocked'],
      default: 'pending',
    },
    // A rejected request may be sent again; each pending occurrence has one alert.
    requestVersion: { type: Number, default: 1, min: 1, validate: Number.isSafeInteger },
    requestedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Prevent duplicate records for any pair of users.
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });

module.exports = mongoose.model('Friendship', friendshipSchema);

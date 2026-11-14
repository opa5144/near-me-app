const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  installationId: { type: String, required: true, maxlength: 100 },
  projectId: { type: String, required: true, maxlength: 100 },
  platform: { type: String, enum: ['android', 'ios'], required: true },
  token: { type: String, required: true, select: false, maxlength: 300 },
  tokenHash: { type: String, required: true, unique: true, select: false, maxlength: 64 },
  active: { type: Boolean, default: true },
  lastSeenAt: { type: Date, required: true, default: Date.now },
  disabledReason: { type: String, default: null, maxlength: 100 },
}, { timestamps: true, collection: 'pushDevices' });
schema.index({ userId: 1, active: 1 });
schema.index({ userId: 1, installationId: 1 });
module.exports = mongoose.model('PushDevice', schema);

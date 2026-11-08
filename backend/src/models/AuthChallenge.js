const mongoose = require('mongoose');

// Pending MFA work carries no usable access token; only its random token hash is persisted.
const authChallengeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  purpose: { type: String, enum: ['login-mfa', 'mfa-setup'], required: true },
  authVersion: { type: Number, required: true },
  authSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AuthSession' },
  secretEncrypted: { type: String, select: false },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, collection: 'AuthChallenges' });

// Routes also compare expiresAt because TTL cleanup is asynchronous.
authChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthChallenge', authChallengeSchema);

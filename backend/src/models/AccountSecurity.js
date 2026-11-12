const mongoose = require('mongoose');

// Staged definition only: current services still use User's existing security fields.
// Collection/index creation must be explicitly enabled during a later approved rollout.
const accountSecuritySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  authVersion: { type: Number, default: 0, min: 0, select: false },
  mfaEnabled: { type: Boolean, default: false, select: false },
  mfaSecretEncrypted: { type: String, select: false },
  mfaRecoveryCodeHashes: { type: [String], default: [], select: false },
  mfaLastUsedStep: { type: Number, default: -1, select: false },
  mfaFailedAttempts: { type: Number, default: 0, select: false },
  mfaLockedUntil: { type: Date, default: null, select: false },
  securityPasswordFailedAttempts: { type: Number, default: 0, select: false },
  securityPasswordLockedUntil: { type: Date, default: null, select: false },
  loginPasswordFailedAttempts: { type: Number, default: 0, select: false },
  loginPasswordLockedUntil: { type: Date, default: null, select: false },
}, {
  timestamps: true,
  collection: 'AccountSecurity',
  autoCreate: false,
  autoIndex: false,
});

module.exports = mongoose.model('AccountSecurity', accountSecuritySchema);

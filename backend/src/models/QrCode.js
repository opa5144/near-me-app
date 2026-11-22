const mongoose = require('mongoose');

// Credential data is encrypted for reopening an owner's ticket. Lookup values
// are keyed hashes; ordinary model reads never expose either form of the secret.
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  selectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventSelection', required: true },
  registrationVersion: { type: Number, min: 0, required: true, validate: Number.isSafeInteger },
  keyVersion: { type: Number, enum: [1], default: 1, required: true },
  tokenHash: { type: String, required: true, select: false },
  tokenEncrypted: { type: String, required: true, select: false },
  codeLookup: { type: String, required: true, select: false },
  codeEncrypted: { type: String, required: true, select: false },
  status: { type: String, enum: ['active', 'used', 'revoked'], default: 'active', required: true },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true, collection: 'QrCodeList' });

schema.index({ userId: 1, eventId: 1, registrationVersion: 1 }, { unique: true });
schema.index({ eventId: 1, codeLookup: 1 }, { unique: true });
schema.index({ tokenHash: 1 }, { unique: true });
schema.index({ selectionId: 1 });
// Tickets are historical evidence: expiry is checked by the service, never a TTL delete.
module.exports = mongoose.model('QrCode', schema);

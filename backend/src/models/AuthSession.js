const mongoose = require('mongoose');

// A session links a user to one unique token hash without storing the usable token.
// Hidden token hashes are excluded from normal queries and API account responses.
const authSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, collection: 'AuthSessions' });

// TTL cleanup is asynchronous; requireAuth also checks expiry explicitly.
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AuthSession', authSessionSchema);

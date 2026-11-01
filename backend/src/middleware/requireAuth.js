const { randomBytes, createHash } = require('node:crypto');
const AuthSession = require('../models/AuthSession');
const User = require('../models/User');

// Each login is valid for one hour unless the user logs out sooner.
const SESSION_LIFETIME_MS = 60 * 60 * 1000;
// Random session tokens use SHA-256 for lookup; user passwords use Argon2id instead.
const hashToken = token => createHash('sha256').update(token).digest('hex');

// Return the raw token to the client once, and save only its hash in Atlas.
async function createSession(userId) {
  const accessToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  // Ensure the token uniqueness and expired-session cleanup indexes exist.
  await AuthSession.init();
  await AuthSession.create({ userId, tokenHash: hashToken(accessToken), expiresAt });
  return { accessToken, expiresAt: expiresAt.toISOString() };
}

// Protected routes receive their user identity from a stored Bearer-token session.
async function requireAuth(req, res, next) {
  try {
    const match = /^Bearer ([a-f0-9]{64})$/i.exec(req.get('authorization') || '');
    if (!match) return res.status(401).json({ message: 'Please log in.' });

    // Check expiry on every request because MongoDB's TTL cleanup may run later.
    const session = await AuthSession.findOne({
      tokenHash: hashToken(match[1]),
      expiresAt: { $gt: new Date() },
    });
    // Sessions also stop working if their associated account has been deleted.
    if (!session || !(await User.exists({ _id: session.userId }))) {
      return res.status(401).json({ message: 'Your session has expired. Please log in again.' });
    }

    // Downstream routes use these verified IDs instead of IDs supplied in the request body.
    req.userId = session.userId;
    req.authSessionId = session._id;
    return next();
  } catch (err) {
    console.error('Session check failed:', err.name);
    return res.status(500).json({ message: 'Unable to check your session. Please try again.' });
  }
}

module.exports = { createSession, requireAuth, hashToken };

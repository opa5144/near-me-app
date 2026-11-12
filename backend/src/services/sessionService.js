const { randomBytes, createHash } = require('node:crypto');
const AuthSession = require('../models/AuthSession');
const { ServiceError } = require('./serviceError');
const { authVersionFilter, accountVersionMatches } = require('./accountState');

const SESSION_LIFETIME_MS = 60 * 60 * 1000;
const hashToken = token => createHash('sha256').update(token).digest('hex');

class SessionStateError extends ServiceError {
  constructor() {
    super(403, 'Your account security changed. Please sign in again.', { errors: {} });
    this.name = 'SessionStateError';
  }
}

// Return the raw token once; Atlas stores only its hash and explicit expiry.
async function createSession(userId, authVersion = 0) {
  if (!(await accountVersionMatches(userId, authVersion))) throw new SessionStateError();
  const accessToken = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await AuthSession.init();
  const session = await AuthSession.create({ userId, tokenHash: hashToken(accessToken), expiresAt, authVersion });
  // A concurrent security change must not revive an older login.
  if (!(await accountVersionMatches(userId, authVersion))) {
    await AuthSession.deleteOne({ _id: session._id });
    throw new SessionStateError();
  }
  return { accessToken, expiresAt: expiresAt.toISOString() };
}

async function findActiveSession(token) {
  const session = await AuthSession.findOne({
    tokenHash: hashToken(token), expiresAt: { $gt: new Date() },
  });
  const authVersion = session?.authVersion ?? 0;
  if (!session || !(await accountVersionMatches(session.userId, authVersion))) return null;
  return { userId: session.userId, sessionId: session._id, authVersion };
}

async function deleteSession(sessionId) {
  await AuthSession.deleteOne({ _id: sessionId });
}

module.exports = {
  createSession, findActiveSession, deleteSession, hashToken, authVersionFilter, SessionStateError,
};

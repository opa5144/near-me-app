const { findActiveSession } = require('../services/sessionService');

// Protected routes receive their user identity from a stored Bearer-token session.
async function requireAuth(req, res, next) {
  try {
    const match = /^Bearer ([a-f0-9]{64})$/i.exec(req.get('authorization') || '');
    if (!match) return res.status(401).json({ message: 'Please log in.' });

    const auth = await findActiveSession(match[1]);
    if (!auth) {
      return res.status(401).json({ message: 'Your session has expired. Please log in again.' });
    }

    // Downstream routes use these verified IDs instead of IDs supplied in the request body.
    req.userId = auth.userId;
    req.authSessionId = auth.sessionId;
    req.authVersion = auth.authVersion;
    return next();
  } catch (err) {
    console.error('Session check failed:', err.name);
    return res.status(500).json({ message: 'Unable to check your session. Please try again.' });
  }
}

module.exports = { requireAuth };

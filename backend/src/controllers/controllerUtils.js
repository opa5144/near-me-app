const { ServiceError } = require('../services/serviceError');

// Pass only verified identity values to services, never the Express request itself.
function getAuthContext(req) {
  return { userId: req.userId, sessionId: req.authSessionId, authVersion: req.authVersion ?? 0 };
}

function apiBaseUrl(req) {
  return (process.env.PUBLIC_API_URL || (req.protocol + '://' + req.get('host') + '/api')).replace(/\/$/, '');
}

// Keep response bodies and Retry-After headers at the HTTP boundary.
function sendServiceError(res, error) {
  if (!(error instanceof ServiceError)) return false;
  const body = { message: error.message };
  if (error.errors !== undefined) body.errors = error.errors;
  if (error.retryAfterSeconds) {
    body.retryAfterSeconds = error.retryAfterSeconds;
    res.set('Retry-After', String(error.retryAfterSeconds));
  }
  if (error.lockedUntil) body.lockedUntil = error.lockedUntil;
  res.status(error.status).json(body);
  return true;
}

module.exports = { getAuthContext, apiBaseUrl, sendServiceError };

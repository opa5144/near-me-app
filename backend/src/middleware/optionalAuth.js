const { requireAuth } = require('./requireAuth');

// Public event reads stay anonymous unless a stored session is supplied.
function optionalAuth(req, res, next) {
  if (!req.get('authorization')) return next();
  return requireAuth(req, res, next);
}

module.exports = { optionalAuth };

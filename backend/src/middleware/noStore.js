// Tokens, private settings, and security setup details must not be cached.
function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}

module.exports = { noStore };

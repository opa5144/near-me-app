const ratings = require('../services/eventRatingService');
const { getAuthContext, sendServiceError } = require('./controllerUtils');

async function getRating(req, res) {
  try {
    res.set('Cache-Control', 'no-store');
    return res.json(await ratings.getRating(getAuthContext(req), req.params.id));
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Event rating load failed:', error.name);
    return res.status(500).json({ message: 'Unable to load your rating. Please try again.' });
  }
}

async function putRating(req, res) {
  try {
    res.set('Cache-Control', 'no-store');
    return res.json(await ratings.putRating(getAuthContext(req), req.params.id, req.body));
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Event rating save failed:', error.name);
    return res.status(500).json({ message: 'Unable to save your rating. Please try again.' });
  }
}

async function getSummary(req, res) {
  try {
    res.set('Cache-Control', 'no-store');
    return res.json(await ratings.getRatingSummary(getAuthContext(req), req.params.id));
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Event rating summary failed:', error.name);
    return res.status(500).json({ message: 'Unable to load these rating totals. Please try again.' });
  }
}

module.exports = { getRating, putRating, getSummary };

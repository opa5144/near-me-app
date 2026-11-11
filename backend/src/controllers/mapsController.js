const mapsService = require('../services/mapsService');
const { ServiceError } = require('../services/serviceError');

// These proxy endpoints retain their existing `error` response field.
function sendError(res, error, fallback) {
  return res.status(error instanceof ServiceError ? error.status : 500)
    .json({ error: error instanceof ServiceError ? error.message : fallback });
}

async function autocomplete(req, res) {
  try { return res.json(await mapsService.autocomplete(req.body)); }
  catch (error) { return sendError(res, error, 'Failed to look up address recommendations.'); }
}

async function getPlaceDetails(req, res) {
  try { return res.json(await mapsService.getPlaceDetails(req.params.placeId, req.query.sessionToken)); }
  catch (error) { return sendError(res, error, 'Failed to fetch selected venue properties.'); }
}

module.exports = { autocomplete, getPlaceDetails };

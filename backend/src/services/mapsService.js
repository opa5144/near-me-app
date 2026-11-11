const axios = require('axios');
const { ServiceError } = require('./serviceError');

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function autocomplete(body) {
  try {
    const { input, sessionToken } = body;
    if (!input || input.trim().length < 3) {
      throw new ServiceError(400, 'Input must be at least 3 characters.');
    }

    const response = await axios.post(
      'https://places.googleapis.com/v1/places:autocomplete',
      { input, sessionToken },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
        },
      },
    );
    return response.data;
  } catch (error) {
    // Validation does not call the provider or emit provider-error diagnostics.
    if (error instanceof ServiceError) throw error;
    console.log('\n❌ --- GOOGLE API ERROR DIAGNOSTIC --- ❌');
    if (error.response) {
      console.log('STATUS CODE:', error.response.status);
      console.log('DETAILS:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('ERROR MESSAGE:', error.message);
    }
    console.log('----------------------------------------\n');
    throw new ServiceError(500, 'Failed to look up address recommendations.');
  }
}

async function getPlaceDetails(placeId, sessionToken) {
  try {
    if (!placeId) throw new ServiceError(400, 'Missing required placeId URL parameter.');
    const response = await axios.get(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        params: { ...(sessionToken && { sessionToken }) },
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location',
        },
      },
    );
    return response.data;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    console.error('Google Place Details Proxy Error:', error?.response?.data || error.message);
    throw new ServiceError(500, 'Failed to fetch selected venue properties.');
  }
}

module.exports = { autocomplete, getPlaceDetails };

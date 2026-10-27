// backend/routes/mapsRoutes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// 1. Secured Autocomplete Proxy Handler
router.post('/autocomplete', async (req, res) => {
  try {
    const { input, sessionToken } = req.body;

    if (!input || input.trim().length < 3) {
      return res.status(400).json({ error: 'Input must be at least 3 characters.' });
    }

    const response = await axios.post(
      'https://places.googleapis.com/v1/places:autocomplete',
      { 
        input: input,
        sessionToken: sessionToken 
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat'
        }
      }
    );

    return res.json(response.data);
  } catch (error) {
    console.log('\n❌ --- GOOGLE API ERROR DIAGNOSTIC --- ❌');
    if (error.response) {
      console.log('STATUS CODE:', error.response.status);
      console.log('DETAILS:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('ERROR MESSAGE:', error.message);
    }
    console.log('----------------------------------------\n');

    return res.status(500).json({ error: 'Failed to look up address recommendations.' });
  }
});

// 2. Secured Place Details Proxy Handler (FIXED)
router.get('/places/:placeId', async (req, res) => {
  try {
    const { placeId } = req.params;
    const { sessionToken } = req.query;

    if (!placeId) {
      return res.status(400).json({ error: 'Missing required placeId URL parameter.' });
    }

    // ✅ FIXED: Correct Google Places API (New) endpoint URL & template literal syntax
    const response = await axios.get(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        params: { 
          ...(sessionToken && { sessionToken }) 
        },
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          // ✅ CRUCIAL: Required field mask for place details (New)
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location'
        }
      }
    );

    return res.json(response.data);
  } catch (error) {
    console.error('Google Place Details Proxy Error:', error?.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to fetch selected venue properties.' });
  }
});

module.exports = router;
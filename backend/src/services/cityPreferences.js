const axios = require('axios');
const { ServiceError } = require('./serviceError');

class CityLookupError extends ServiceError {
  constructor(status, message) {
    super(status, message);
    this.name = 'CityLookupError';
  }
}

function headers(fieldMask) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new CityLookupError(503, 'City search is unavailable. Please try again later.');
  return { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fieldMask };
}

function validPlaceId(placeId) {
  return typeof placeId === 'string' && /^[A-Za-z0-9_-]{1,255}$/.test(placeId);
}

function lookupFailure(error) {
  if (error instanceof CityLookupError) return error;
  if (error.response?.status === 404) return new CityLookupError(400, 'This city is no longer available. Search for it again.');
  // Never log Axios configuration: it contains the server's private Maps key.
  return new CityLookupError(503, 'Unable to look up cities. Please try again.');
}

async function searchCities(input) {
  try {
    const { data } = await axios.post('https://places.googleapis.com/v1/places:autocomplete', {
      input,
      includedPrimaryTypes: ['(cities)'],
    }, {
      headers: headers('suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat'),
      timeout: 6000,
    });
    return (data.suggestions ?? []).filter(item => item.placePrediction?.placeId).map(({ placePrediction: city }) => ({
      placeId: city.placeId,
      name: city.structuredFormat?.mainText?.text || city.text?.text || '',
      label: city.text?.text || city.structuredFormat?.mainText?.text || '',
    }));
  } catch (error) {
    throw lookupFailure(error);
  }
}

async function fetchCity(placeId) {
  if (!validPlaceId(placeId)) throw new CityLookupError(400, 'Choose a city from the search results.');
  try {
    const { data } = await axios.get('https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId), {
      headers: headers('id,displayName,formattedAddress,types'),
      timeout: 6000,
    });
    // A client cannot save an arbitrary venue as a city by submitting its place ID.
    if (!data.types?.some(type => ['locality', 'postal_town', 'administrative_area_level_3'].includes(type))) {
      throw new CityLookupError(400, 'Choose a city rather than a venue or street address.');
    }
    return { placeId, name: data.displayName?.text || data.formattedAddress, label: data.formattedAddress || data.displayName?.text };
  } catch (error) {
    throw lookupFailure(error);
  }
}

async function displayCities(cities, known = new Map()) {
  // Only exempt place IDs and user choices are stored. Google names/addresses
  // remain transient, and an outage must not erase a saved subscription.
  return Promise.all(cities.map(async city => {
    try {
      const details = known.get(city.placeId) || await fetchCity(city.placeId);
      return { ...details, subscribed: city.subscribed };
    } catch {
      return {
        placeId: city.placeId, subscribed: city.subscribed, unavailable: true,
        name: 'City unavailable', label: 'Try searching for this city again.',
      };
    }
  }));
}

module.exports = { CityLookupError, validPlaceId, searchCities, fetchCity, displayCities };

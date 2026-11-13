// Resolve the officially sourced demo venues into Google place IDs/coordinates.
// This is fixture preparation only. It does not read or write MongoDB.
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
const filename = path.resolve(__dirname, 'fixtures/category-demo/venues.json');
const fixture = JSON.parse(fs.readFileSync(filename, 'utf8'));

async function resolve(venue) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST', signal: AbortSignal.timeout(20000), redirect: 'error',
    headers: {
      'Content-Type': 'application/json', 'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({ textQuery: venue.place + ', ' + venue.address, languageCode: 'en', regionCode: 'US', pageSize: 1 }),
  });
  if (!response.ok) throw new Error(`Venue lookup failed with HTTP ${response.status}; no database data was changed.`);
  const place = (await response.json()).places?.[0];
  const latitude = place?.location?.latitude;
  const longitude = place?.location?.longitude;
  // These twelve officially verified venues are all in New York City.
  if (typeof place?.id !== 'string' || !place.id || typeof place.formattedAddress !== 'string' ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 40.5 || latitude > 40.95 ||
      longitude < -74.3 || longitude > -73.65) throw new Error('A venue did not resolve to a usable New York location.');
  const postalCode = venue.address.match(/\b\d{5}\b/)?.[0];
  if (!postalCode || !place.formattedAddress.includes(postalCode)) throw new Error('A resolved venue has a different postal code; manual review is required.');
  Object.assign(venue, {
    placeId: place.id, latitude, longitude,
    googleName: place.displayName?.text ?? venue.place,
    googleAddress: place.formattedAddress, verifiedOn: '2026-11-12',
  });
}

async function main() {
  if (!process.env.GOOGLE_MAPS_API_KEY) throw new Error('The existing server Maps key is not configured.');
  for (let offset = 0; offset < fixture.venues.length; offset += 3) {
    const results = await Promise.allSettled(fixture.venues.slice(offset, offset + 3).map(resolve));
    fs.writeFileSync(filename, JSON.stringify(fixture, null, 2) + '\n');
    const failed = results.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
  console.log(JSON.stringify({ venues: fixture.venues.map(({ key, place, address, googleName, googleAddress, latitude, longitude }) => ({
    key, place, address, googleName, googleAddress, latitude, longitude,
  })) }, null, 2));
}

main().catch(error => {
  // Never print request objects, headers, provider diagnostics, or the API key.
  console.error(error instanceof Error && !['TypeError', 'TimeoutError'].includes(error.name)
    ? error.message : 'Venue resolution could not finish; no database data was changed.');
  process.exitCode = 1;
});

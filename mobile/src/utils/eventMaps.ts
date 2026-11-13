import { Linking } from 'react-native';

type EventMapLocation = {
  venue?: string; address?: string; location?: string; placeId?: string;
  latitude?: number | null; longitude?: number | null;
};

// HTTPS Maps links work without probing custom app schemes. A saved place ID
// identifies the venue; its readable name/address remains the search fallback.
export async function openEventMaps(event: EventMapLocation): Promise<void> {
  const name = event.venue?.trim() || '';
  const address = event.address?.trim() || event.location?.trim() || '';
  const placeId = event.placeId?.trim() || '';
  const hasCoordinates = typeof event.latitude === 'number' && Number.isFinite(event.latitude) &&
    event.latitude >= -90 && event.latitude <= 90 && typeof event.longitude === 'number' &&
    Number.isFinite(event.longitude) && event.longitude >= -180 && event.longitude <= 180;
  const query = address ? [name, address].filter(Boolean).join(', ')
    : hasCoordinates ? `${event.latitude},${event.longitude}` : name || placeId;
  if (!query) throw new Error('This event does not have a saved map location.');
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` +
    (placeId ? `&query_place_id=${encodeURIComponent(placeId)}` : '');
  try { await Linking.openURL(url); }
  catch { throw new Error('Maps could not be opened. Please try again.'); }
}

const MAX_IMAGE_BYTES = 1024 * 1024;
const CATEGORIES = ['Music', 'Dance', 'Food', 'Film', 'Workshop', 'Art'];

// Validation failures carry a safe message and HTTP status for the event route.
class EventInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'EventInputError';
    this.status = status;
  }
}

// Normalize required text once while enforcing the model's maximum field lengths.
function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new EventInputError(label + ' is required and must be at most ' + maxLength + ' characters.');
  }
  return value.trim();
}

// Convert untrusted JSON into allowed database fields without copying arbitrary properties.
function parseCreateEvent(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new EventInputError('Please submit an event object.');
  }
  const title = requiredText(body.title, 'Title', 150);
  const description = requiredText(body.description, 'Description', 10000);
  const address = requiredText(body.address, 'Address', 500);
  const place = requiredText(body.place, 'Place', 300);
  if (!CATEGORIES.includes(body.category)) throw new EventInputError('Please choose a valid category.');

  // Accept zero for free events and reject amounts with fractions smaller than one cent.
  if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0 ||
      Math.abs(body.price * 100 - Math.round(body.price * 100)) > 0.000001) {
    throw new EventInputError('Price must be a non-negative number with at most two decimal places.');
  }
  // Validate real start/end instants before checking future starts and minimum duration.
  if (typeof body.startsAt !== 'string' || typeof body.endsAt !== 'string') {
    throw new EventInputError('Start and end timestamps are required.');
  }
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    throw new EventInputError('Please supply valid start and end timestamps.');
  }
  if (startsAt.getTime() <= Date.now()) throw new EventInputError('The event must start in the future.');
  if (endsAt.getTime() - startsAt.getTime() < 30 * 60 * 1000) {
    throw new EventInputError('The event must last at least 30 minutes.');
  }
  // Confirm the stored display timezone is recognized independently of the server's zone.
  if (typeof body.timeZone !== 'string') throw new EventInputError('A timezone is required.');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: body.timeZone }).format(startsAt);
  } catch {
    throw new EventInputError('Please supply a valid IANA timezone.');
  }

  // Coordinates are optional, but a valid latitude/longitude pair must be supplied together.
  const hasLatitude = body.latitude !== undefined && body.latitude !== null;
  const hasLongitude = body.longitude !== undefined && body.longitude !== null;
  if (hasLatitude !== hasLongitude ||
      (hasLatitude && (typeof body.latitude !== 'number' || !Number.isFinite(body.latitude) ||
        typeof body.longitude !== 'number' || !Number.isFinite(body.longitude) ||
        body.latitude < -90 || body.latitude > 90 || body.longitude < -180 || body.longitude > 180))) {
    throw new EventInputError('Please supply valid latitude and longitude together.');
  }

  // Decode optional pure Base64; check encoded and decoded limits because Base64 expands bytes.
  let imageData;
  let imageMimeType = null;
  if (body.imageBase64 !== undefined && body.imageBase64 !== null && body.imageBase64 !== '') {
    if (typeof body.imageBase64 !== 'string' ||
        body.imageBase64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(body.imageBase64) ||
        body.imageBase64.length % 4 !== 0) {
      throw new EventInputError('Please select a JPEG image no larger than 1 MiB.', 413);
    }
    imageData = Buffer.from(body.imageBase64, 'base64');
    if (imageData.length > MAX_IMAGE_BYTES) {
      throw new EventInputError('Please select a JPEG image no larger than 1 MiB.', 413);
    }
    // Screen JPEG boundary markers; this is a signature check, not a full image decode.
    if (imageData.length < 4 || imageData[0] !== 0xff || imageData[1] !== 0xd8 || imageData[2] !== 0xff ||
        imageData[imageData.length - 2] !== 0xff || imageData[imageData.length - 1] !== 0xd9) {
      throw new EventInputError('Please select a valid JPEG image.');
    }
    imageMimeType = 'image/jpeg';
  }

  // Ownership and seed keys are deliberately omitted; the route assigns the authenticated host.
  return {
    title, description, address, place, category: body.category,
    price: Number(body.price.toFixed(2)), startsAt, endsAt, timeZone: body.timeZone,
    placeId: typeof body.placeId === 'string' ? body.placeId.slice(0, 500) : null,
    latitude: hasLatitude ? body.latitude : null,
    longitude: hasLongitude ? body.longitude : null,
    ...(imageData ? { imageData } : {}),
    imageMimeType,
  };
}

// Translate a database record into the shared mobile shape with no embedded image bytes.
function toEventItem(event, apiBaseUrl) {
  const timeZone = event.timeZone;
  // Format display labels in the event's zone, keeping output consistent across devices.
  const dateFormat = new Intl.DateTimeFormat('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone,
  });
  const timeFormat = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone,
  });
  const calendarFormat = new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'numeric', day: 'numeric', timeZone,
  });
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  // Overnight events show the ending day instead of appearing to end before they start.
  const crossesDay = calendarFormat.format(start) !== calendarFormat.format(end);
  // Keep a numeric price for app logic alongside the formatted Free/currency label.
  const priceAmount = Number(event.price);
  return {
    id: String(event._id),
    hostId: String(event.hostId),
    title: event.title,
    category: event.category,
    date: dateFormat.format(start),
    time: timeFormat.format(start) + ' – ' + timeFormat.format(end) +
      (crossesDay ? ' (ends ' + dateFormat.format(end) + ')' : ''),
    venue: event.place,
    price: priceAmount === 0 ? 'Free' : new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
    }).format(priceAmount),
    description: event.description,
    emoji: event.emoji || '🎟️',
    accent: event.accent || '#6549EF',
    location: event.address,
    ...(event.imageMimeType ? { bannerImage: apiBaseUrl.replace(/\/$/, '') + '/events/' + event._id + '/image' } : {}),
    priceAmount,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    timeZone,
    address: event.address,
    place: event.place,
    ...(event.placeId ? { placeId: event.placeId } : {}),
    ...(event.latitude !== null && event.latitude !== undefined ? { latitude: event.latitude, longitude: event.longitude } : {}),
  };
}

module.exports = { parseCreateEvent, toEventItem, EventInputError, MAX_IMAGE_BYTES };

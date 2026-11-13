const { MAX_IMAGE_BYTES, validatePhotoInput, photoItems } = require('./photoData');
const { EVENT_CATEGORIES } = require('../constants/eventCategories');

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

function parseEventCategories(body) {
  // An explicitly supplied categories field must be valid; an old category must
  // not hide an empty or malformed canonical value.
  const values = Object.prototype.hasOwnProperty.call(body, 'categories')
    ? body.categories : typeof body.category === 'string' ? [body.category] : undefined;
  if (!Array.isArray(values) || values.length < 1 || values.length > EVENT_CATEGORIES.length ||
      values.some(value => typeof value !== 'string' || !EVENT_CATEGORIES.includes(value.trim()))) {
    throw new EventInputError('Please choose one to six supported event categories.');
  }
  const categories = values.map(value => value.trim());
  if (new Set(categories).size !== categories.length) {
    throw new EventInputError('Each event category can only be selected once.');
  }
  return categories;
}

function categoriesForEvent(event) {
  // Read existing singleton records without changing them. Canonical arrays take
  // precedence over a stale compatibility field left on an edited older record.
  const values = Array.isArray(event.categories) && event.categories.length
    ? event.categories : typeof event.category === 'string' ? [event.category] : [];
  return [...new Set(values.filter(value => typeof value === 'string' &&
    EVENT_CATEGORIES.includes(value.trim())).map(value => value.trim()))];
}

// Require an explicit year and timezone instead of JavaScript's permissive, yearless date parsing.
function parseEventTimestamp(value, label = 'Timestamp') {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) {
    throw new EventInputError(label + ' must include a four-digit year, date, time, and Z or a UTC offset.');
  }
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const zone = match[8];
  const validOffset = zone === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4, 6)) <= 59);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1] ||
      hour > 23 || minute > 59 || second > 59 || !validOffset) {
    throw new EventInputError(label + ' must be a valid ISO date and time.');
  }
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw new EventInputError(label + ' must be a valid ISO date and time.');
  return instant;
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
  const categories = parseEventCategories(body);

  // Accept zero for free events and reject amounts with fractions smaller than one cent.
  if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0 ||
      Math.abs(body.price * 100 - Math.round(body.price * 100)) > 0.000001) {
    throw new EventInputError('Price must be a non-negative number with at most two decimal places.');
  }
  // Validate real, fully specified instants before checking future starts and minimum duration.
  const startsAt = parseEventTimestamp(body.startsAt, 'Start time');
  const endsAt = parseEventTimestamp(body.endsAt, 'End time');
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

  // Full ordered photo lists are resolved against this event by the service, not trusted as stored IDs.
  if (Object.prototype.hasOwnProperty.call(body, 'photos')) {
    validatePhotoInput(body.photos);
    if (body.imageBase64 !== undefined && body.imageBase64 !== null && body.imageBase64 !== '') {
      throw new EventInputError('Submit photos or a single legacy image, not both.');
    }
  }
  // The single-image request remains compatible, but its bytes are stored only
  // by the collection-backed photo service, never on the main event record.
  if (body.imageBase64 !== undefined && body.imageBase64 !== null && body.imageBase64 !== '') {
    validatePhotoInput([{ imageBase64: body.imageBase64 }]);
  }

  // Ownership and seed keys are deliberately omitted; the route assigns the authenticated host.
  return {
    title, description, address, place, categories,
    price: Number(body.price.toFixed(2)), startsAt, endsAt, timeZone: body.timeZone,
    placeId: typeof body.placeId === 'string' ? body.placeId.slice(0, 500) : null,
    latitude: hasLatitude ? body.latitude : null,
    longitude: hasLongitude ? body.longitude : null,
  };
}

// Translate a database record into the shared mobile shape with no embedded image bytes.
function toEventItem(event, apiBaseUrl, photoDocuments = [], audience) {
  const timeZone = event.timeZone;
  // Format display labels in the event's zone, keeping output consistent across devices.
  const dateFormat = new Intl.DateTimeFormat('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric', timeZone,
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
  const photos = photoItems(event, apiBaseUrl, 'events', photoDocuments);
  const categories = categoriesForEvent(event);
  return {
    id: String(event._id),
    // For hostId, return an object with user details if populated, otherwise just the ID string. 
    hostId: event.hostId && typeof event.hostId === 'object' ? {
      _id: String(event.hostId._id),
      username: event.hostId.username,
      firstName: event.hostId.firstName,
      lastName: event.hostId.lastName,
    } : String(event.hostId),

    title: event.title,
    categories,
    // Keep the first category for older app builds while every current screen
    // adopts the complete array. This compatibility value is never stored anew.
    ...(categories[0] ? { category: categories[0] } : {}),
    // Optional for history serializers; event list/detail responses supply live totals.
    ...(audience ? { interestedCount: audience.interestedCount, attendingCount: audience.attendingCount } : {}),
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
    photos,
    ...(photos[0] ? { bannerImage: photos[0].url } : {}),
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

module.exports = { parseCreateEvent, parseEventTimestamp, toEventItem, EventInputError, MAX_IMAGE_BYTES };

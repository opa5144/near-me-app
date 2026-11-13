import { isAxiosError } from 'axios';
import { eventCategories } from '../../data/events';
import { toPhotoInput } from '../../api/photos';
import type { EditablePhoto } from '../../api/photos';
import { businessDays } from '../../components/BusinessHoursEditor';
import type { BusinessHoursData } from '../../components/BusinessHoursEditor';

export type HostFieldErrors = Record<string, string | undefined>;
export type HostVenue = { name: string; address: string; placeId?: string; latitude?: number; longitude?: number };

export const formatHostDate = (value: Date) =>
  `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
export const clockTime = (value: Date) => `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;

// Calculate cents as integers so a valid decimal price keeps its cents.
export function priceToAmount(value: string): number | null {
  const text = value.trim();
  if (!text) return 0;
  if (!/^(?:\d{1,7}(?:\.\d{0,2})?|\.\d{1,2})$/.test(text)) return null;
  const [whole, fractional = ''] = text.split('.');
  const cents = Number(whole || '0') * 100 + Number(fractional.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents >= 0 ? cents / 100 : null;
}

function requiredText(value: string, label: string, maximum: number) {
  if (!value.trim()) return `Enter ${label}.`;
  if (value.trim().length > maximum) return `Use ${maximum} characters or fewer.`;
}

function timeZoneError(value: string) {
  if (!value.trim() || value.trim().length > 100) return 'Choose a valid IANA time zone, such as America/New_York.';
  try { new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }); }
  catch { return 'Choose a valid IANA time zone, such as America/New_York.'; }
}

function locationError(venue: HostVenue | null) {
  if (!venue?.name.trim() || !venue.address.trim()) return 'Search and select a location with a complete address.';
  if (venue.name.trim().length > 300 || venue.address.trim().length > 500) return 'Choose a location with a shorter name or address.';
  const { latitude, longitude } = venue;
  if ((latitude === undefined) !== (longitude === undefined) ||
      (latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== undefined && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
    return 'Select a location with valid latitude and longitude.';
  }
}

function photoError(photos: EditablePhoto[]) {
  try { toPhotoInput(photos); }
  catch (reason) { return reason instanceof Error ? reason.message : 'Remove the photo that could not be prepared and add it again.'; }
}

function validCategories(values: string[]) {
  return values.length >= 1 && values.length <= eventCategories.length &&
    new Set(values).size === values.length && values.every(value => eventCategories.includes(value));
}

export interface EventDraft {
  title: string; description: string; categories: string[]; date: string;
  startTime: Date; endTime: Date; price: string; venue: HostVenue | null;
  timeZone: string; photos: EditablePhoto[];
}

// Call only on field exit/picker completion or submit. Clock edits themselves do
// not show errors. Earlier end times mean the next day, including across DST.
export function validateEventDraft(draft: EventDraft) {
  const errors: HostFieldErrors = {
    title: requiredText(draft.title, 'an event title', 150),
    description: requiredText(draft.description, 'an event description', 10000),
    categories: validCategories(draft.categories) ? undefined : 'Choose at least one event category.',
    location: locationError(draft.venue), timeZone: timeZoneError(draft.timeZone), photos: photoError(draft.photos),
  };
  const priceAmount = priceToAmount(draft.price);
  if (priceAmount === null) errors.price = 'Enter a price with up to two decimal places, or leave blank for free.';
  let start: Date | undefined;
  let end: Date | undefined;
  const day = new Date(`${draft.date}T00:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number(draft.date.slice(0, 4)) < 1 ||
      !Number.isFinite(day.getTime()) || formatHostDate(day) !== draft.date) {
    errors.date = 'Choose a valid event date including the year.';
  } else if (!Number.isFinite(draft.startTime.getTime()) || !Number.isFinite(draft.endTime.getTime())) {
    if (!Number.isFinite(draft.startTime.getTime())) errors.startTime = 'Choose a valid start time.';
    if (!Number.isFinite(draft.endTime.getTime())) errors.endTime = 'Choose a valid end time.';
  } else {
    start = new Date(day);
    end = new Date(day);
    if (draft.endTime.getHours() * 60 + draft.endTime.getMinutes() < draft.startTime.getHours() * 60 + draft.startTime.getMinutes()) {
      end.setDate(end.getDate() + 1);
    }
    const expectedEndDate = formatHostDate(end);
    start.setHours(draft.startTime.getHours(), draft.startTime.getMinutes(), 0, 0);
    end.setHours(draft.endTime.getHours(), draft.endTime.getMinutes(), 0, 0);
    // A spring DST gap silently shifts a JavaScript Date; reject that changed
    // wall-clock time. An autumn repeated time keeps the earlier occurrence.
    if (formatHostDate(start) !== draft.date || start.getHours() !== draft.startTime.getHours() || start.getMinutes() !== draft.startTime.getMinutes()) {
      errors.startTime = 'That start time does not exist on this date in your device time zone.';
    }
    if (formatHostDate(end) !== expectedEndDate || end.getHours() !== draft.endTime.getHours() || end.getMinutes() !== draft.endTime.getMinutes()) {
      errors.endTime = 'That end time does not exist on this date in your device time zone.';
    }
    if (!errors.startTime && start.getTime() <= Date.now()) errors.startTime = 'The event must start in the future.';
    if (!errors.startTime && !errors.endTime && end.getTime() - start.getTime() < 30 * 60 * 1000) {
      errors.endTime = 'The event must last at least 30 minutes.';
    }
  }
  return { errors, priceAmount, start, end };
}

export interface StoreDraft {
  name: string; description: string; categories: string[]; venue: HostVenue | null;
  timeZone: string; hours: BusinessHoursData; photos: EditablePhoto[];
}

export function validateStoreDraft(draft: StoreDraft): HostFieldErrors {
  const errors: HostFieldErrors = {
    name: requiredText(draft.name, 'your business name', 150),
    description: requiredText(draft.description, 'a store description', 5000),
    location: locationError(draft.venue), timeZone: timeZoneError(draft.timeZone), photos: photoError(draft.photos),
  };
  if (!validCategories(draft.categories)) errors.categories = 'Choose at least one vendor category.';
  for (const day of businessDays) {
    const hours = draft.hours[day];
    if (!hours || typeof hours.open !== 'boolean') errors[`hours.${day}`] = 'Choose open or closed for this day.';
    else if (hours.open && (!Number.isFinite(hours.openTime.getTime()) || !Number.isFinite(hours.closeTime.getTime()))) {
      errors[`hours.${day}`] = 'Choose valid opening and closing times.';
    } else if (hours.open && clockTime(hours.openTime) === clockTime(hours.closeTime)) {
      errors[`hours.${day}`] = 'Opening and closing times must be different.';
    }
  }
  return errors;
}

export const hasHostErrors = (errors: HostFieldErrors) => Object.values(errors).some(Boolean);

// Update only the field that was exited; other untouched controls stay quiet.
export function mergeHostFieldErrors(current: HostFieldErrors, next: HostFieldErrors, fields: string[]) {
  const merged = { ...current };
  for (const field of fields) merged[field] = next[field];
  return merged;
}

function errorField(key: string) {
  if (key === 'category' || /^categories(?:\.|\[|$)/.test(key)) return 'categories';
  if (/^(address|place|placeId|latitude|longitude)$/.test(key)) return 'location';
  if (key === 'startsAt') return 'startTime';
  if (key === 'endsAt') return 'endTime';
  if (key === 'imageBase64' || /^photos(?:\.|\[|$)/.test(key)) return 'photos';
  const hours = /^(?:businessHours|hours)[.\[]([A-Za-z]+|\d+)/.exec(key);
  if (hours) {
    const day = /^\d+$/.test(hours[1]) ? businessDays[Number(hours[1])] : businessDays.find(value => value === hours[1]);
    if (day) return `hours.${day}`;
  }
  return key;
}

// Older event responses contain one message; newer responses may give a field
// map. Network/session failures belong to the form, not an unrelated input.
export function hostRequestError(reason: unknown, fallback: string): { errors: HostFieldErrors; message: string | null } {
  const errors: HostFieldErrors = {};
  if (!isAxiosError<{ message?: string; errors?: Record<string, string> }>(reason)) {
    const message = reason instanceof Error ? reason.message : fallback;
    if (/photo|image|JPEG|MiB/i.test(message)) return { errors: { photos: message }, message: null };
    return { errors, message };
  }
  if (!reason.response) return { errors, message: 'No response from the server. Check your connection and try again.' };
  const data = reason.response.data;
  const message = typeof data?.message === 'string' ? data.message : fallback;
  if (reason.response.status !== 400 && reason.response.status !== 422) return { errors, message };
  const knownFields = new Set(['title', 'name', 'description', 'category', 'categories', 'location', 'date', 'startTime', 'endTime', 'price', 'timeZone', 'photos', 'businessHours']);
  const unmapped: string[] = [];
  for (const [key, value] of Object.entries(data?.errors || {})) {
    if (typeof value !== 'string' || !value) continue;
    const field = errorField(key);
    if (knownFields.has(field) || businessDays.some(day => field === `hours.${day}`)) errors[field] = value;
    else unmapped.push(value);
  }
  if (hasHostErrors(errors)) return { errors, message: unmapped.length ? unmapped.join('\n') : null };
  const inferred = /title/i.test(message) ? 'title' : /description/i.test(message) ? 'description'
    : /categor/i.test(message) ? 'categories' : /price/i.test(message) ? 'price'
    : /timezone|time zone/i.test(message) ? 'timeZone' : /duration|30 minutes|end time|last at least/i.test(message) ? 'endTime'
    : /start time|start in the future/i.test(message) ? 'startTime' : /photo|image|JPEG|MiB/i.test(message) ? 'photos'
    : /address|place|latitude|longitude|location/i.test(message) ? 'location' : undefined;
  return inferred ? { errors: { [inferred]: message }, message: null } : { errors, message };
}

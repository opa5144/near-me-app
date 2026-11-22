import { Linking, Platform } from 'react-native';
import * as Calendar from 'expo-calendar/legacy';
import type { EventItem } from '../data/events';

const calendarTimestamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

// Resolves a writable calendar ID without locking in a permanent choice across sessions.
async function getTargetCalendarId(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    try {
      const defaultCal = await Calendar.getDefaultCalendarAsync();
      if (defaultCal?.id && defaultCal.allowsModifications) {
        return defaultCal.id;
      }
    } catch {
      // Fall back to scanning writable calendars below.
    }
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.find(cal => cal.allowsModifications);
  if (writable) return writable.id;

  const source =
    Platform.OS === 'ios'
      ? (await Calendar.getDefaultCalendarAsync())?.source
      : ({ isLocalAccount: true, name: 'NearMe', type: Calendar.CalendarType.LOCAL } as Calendar.Source);

  if (!source) return null;
  return Calendar.createCalendarAsync({
    title: 'NearMe',
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: source.id,
    source,
    name: 'NearMe',
    ownerAccount: source.name || 'local',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

// Opens the Calendar app once to the earliest itinerary date so all added events can be viewed/edited.
async function openCalendarToDate(targetDate: Date): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      // Apple's calshow URL scheme expects seconds since Jan 1, 2001 (CFAbsoluteTime).
      const appleEpochSeconds = Math.floor(targetDate.getTime() / 1000) - 978307200;
      await Linking.openURL(`calshow:${appleEpochSeconds}`);
    } else if (Platform.OS === 'android') {
      await Linking.openURL(`content://com.android.calendar/time/${targetDate.getTime()}`);
    }
  } catch {
    // Ignore deep-link failure if no external calendar handler is registered.
  }
}

// Batch-inserts all valid itinerary events and opens the Calendar app once to their start date.
export async function addEventsToCalendarAndOpen(
  events: EventItem[]
): Promise<{ addedCount: number; skippedCount: number }> {
  const validEvents = events.filter(event => {
    const startDate = new Date(event.startsAt);
    const endDate = new Date(event.endsAt);
    return (
      event.status !== 'cancelled' &&
      Number.isFinite(startDate.getTime()) &&
      Number.isFinite(endDate.getTime()) &&
      endDate > startDate
    );
  });

  if (!validEvents.length) {
    return { addedCount: 0, skippedCount: events.length };
  }

  if (Platform.OS === 'web') {
    for (const event of validEvents) {
      await addEventToCalendar(event);
    }
    return { addedCount: validEvents.length, skippedCount: events.length - validEvents.length };
  }

  const permission = await Calendar.requestCalendarPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Calendar permission was not granted.');
  }

  const calendarId = await getTargetCalendarId();
  if (!calendarId) {
    throw new Error('No writable calendar is available on this device.');
  }

  let addedCount = 0;
  let earliestStartDate = new Date(validEvents[0].startsAt);

  for (const event of validEvents) {
    const startDate = new Date(event.startsAt);
    const endDate = new Date(event.endsAt);
    if (startDate < earliestStartDate) earliestStartDate = startDate;

    const location = [event.venue, event.address || event.location].filter(Boolean).join(', ');
    try {
      await Calendar.createEventAsync(calendarId, {
        title: event.title,
        notes: event.description,
        location,
        startDate,
        endDate,
        timeZone: event.timeZone,
      });
      addedCount += 1;
    } catch {
      // Continue inserting remaining events if one item fails.
    }
  }

  if (addedCount > 0) {
    await openCalendarToDate(earliestStartDate);
  }

  return { addedCount, skippedCount: events.length - addedCount };
}

// Native calendar presents its editor so the user chooses whether to save. When
// that editor is unavailable, the browser fallback keeps the same full instants.
export async function addEventToCalendar(event: EventItem): Promise<void> {
  const startDate = new Date(event.startsAt);
  const endDate = new Date(event.endsAt);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
    throw new Error('This event has no valid calendar schedule. Reload the event and try again.');
  }
  if (event.status === 'cancelled') throw new Error('Cancelled events cannot be added to your calendar.');
  const location = [event.venue, event.address || event.location].filter(Boolean).join(', ');
  if (Platform.OS !== 'web') {
    try {
      await Calendar.createEventInCalendarAsync({
        title: event.title, notes: event.description, location, startDate, endDate,
      });
      return;
    } catch {
      // Do not expose native/provider error objects or swallow a failed action.
    }
  }
  const parameters = [
    ['action', 'TEMPLATE'], ['text', event.title], ['details', event.description], ['location', location],
    ['dates', `${calendarTimestamp(startDate)}/${calendarTimestamp(endDate)}`],
    ...(event.timeZone ? [['ctz', event.timeZone]] : []),
  ].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  try { await Linking.openURL('https://calendar.google.com/calendar/render?' + parameters); }
  catch { throw new Error('The calendar could not be opened. Please try again.'); }
}
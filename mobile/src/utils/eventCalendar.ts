import { Linking, Platform } from 'react-native';
import * as Calendar from 'expo-calendar/legacy';
import type { EventItem } from '../data/events';

const calendarTimestamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

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

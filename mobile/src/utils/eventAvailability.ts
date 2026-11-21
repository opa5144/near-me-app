import type { EventItem } from '../data/events';

// Discovery and saved itineraries share the same end boundary. Registration
// deadlines are separate: an ongoing event can still be available to attend.
export function isAvailableEvent(event: EventItem, now = Date.now()): boolean {
  if (event.status && event.status !== 'published') return false;
  if (event.storage && event.storage !== 'current') return false;
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && start < end && end > now;
}

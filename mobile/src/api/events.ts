import { api } from './client';
import type { EventItem } from '../data/events';
import { normalizeEventCategories } from '../data/events';
import { formatEventDate } from '../utils/dateFormat';
import type { PhotoInput } from './photos';
export type { EventItem };

// Creation sends canonical values, not the formatted strings shown in event cards.
// hostId is deliberately absent: the backend derives it from the Bearer session.
export interface CreateEventRequest {
  title: string;
  categories: string[];
  description: string;
  price: number;
  startsAt: string; // ISO timestamp, including its UTC offset (normally toISOString()).
  endsAt: string;
  timeZone: string;
  address: string;
  place: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  imageBase64?: string; // Raw JPEG base64; the device-local preview URI is not uploaded.
  photos?: PhotoInput[]; // Ordered complete collection; omission preserves it, [] clears it.
}

export type UpdateEventRequest = Partial<CreateEventRequest>;

type ApiEventItem = Omit<EventItem, 'categories'> & { categories?: unknown; category?: unknown };

function normalizeEvent(event: ApiEventItem): EventItem {
  const { category, ...fields } = event;
  return { ...fields, categories: normalizeEventCategories(event.categories, category), date: formatEventDate(event.startsAt, event.timeZone) };
}

// Home/Search share this public list; the backend formats each EventItem response.
export async function fetchEvents(): Promise<EventItem[]> {
  const response = await api.get<{ events: ApiEventItem[] }>('/events');
  return response.data.events.map(normalizeEvent);
}
// The shared client attaches Authorization; ownership is filtered by the server.
export async function fetchMyEvents(): Promise<EventItem[]> {
  const response = await api.get<{ events: ApiEventItem[] }>('/events/mine');
  return response.data.events.map(normalizeEvent);
}
// Details always reload by the database ID instead of trusting a copied list item.
export async function fetchEvent(id: string, signal?: AbortSignal): Promise<EventItem> {
  const response = await api.get<{ event: ApiEventItem }>('/events/' + encodeURIComponent(id), { signal });
  return normalizeEvent(response.data.event);
}
// Return the saved server record so shared state uses its real ID and image URL.
// Image payloads get a longer timeout than the client's normal text-only requests.
export async function createEvent(input: CreateEventRequest): Promise<EventItem> {
  const response = await api.post<{ event: ApiEventItem }>('/events', input, { timeout: 30000 });
  return normalizeEvent(response.data.event);
}

// Update an existing event record by ID with optional payload fields.
export async function updateEvent(id: string, input: UpdateEventRequest): Promise<EventItem> {
  const response = await api.patch<{ event?: ApiEventItem } | ApiEventItem>('/events/' + encodeURIComponent(id), input, { timeout: 30000 });
  const data = response.data;
  return normalizeEvent(('event' in data && data.event) ? data.event : (data as ApiEventItem));
}
// Independent saved choices belong to the authenticated account, never a client-supplied user ID.
export interface EventSelection {
  eventId: string;
  interested: boolean;
  attending: boolean;
}

export interface BookingHistoryItem extends EventSelection {
  id: string; // The selection record ID, used by the private history detail route.
  event: EventItem;
}
type ApiBookingHistoryItem = Omit<BookingHistoryItem, 'event'> & { event: ApiEventItem };

export async function fetchEventSelections(signal?: AbortSignal): Promise<EventSelection[]> {
  const response = await api.get<{ selections: EventSelection[] }>('/event-selections', { signal });
  return response.data.selections;
}

export async function saveEventSelection(
  eventId: string,
  changes: Partial<Pick<EventSelection, 'interested' | 'attending'>>,
): Promise<EventSelection> {
  const response = await api.put<{ selection: EventSelection }>(
    '/event-selections/' + encodeURIComponent(eventId), changes,
  );
  return response.data.selection;
}

// History contains ended events with a real saved selection; no sample bookings are fabricated.
export async function fetchBookingHistory(signal?: AbortSignal): Promise<BookingHistoryItem[]> {
  const response = await api.get<{ bookings: ApiBookingHistoryItem[] }>('/event-selections/history', { signal });
  return response.data.bookings.map(booking => ({ ...booking, event: normalizeEvent(booking.event) }));
}

export async function fetchBookingHistoryDetails(id: string, signal?: AbortSignal): Promise<BookingHistoryItem> {
  const response = await api.get<{ booking: ApiBookingHistoryItem }>(
    '/event-selections/history/' + encodeURIComponent(id), { signal },
  );
  const booking = response.data.booking;
  return { ...booking, event: normalizeEvent(booking.event) };
}

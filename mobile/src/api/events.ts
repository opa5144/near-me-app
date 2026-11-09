import { api } from './client';
import type { EventItem } from '../data/events';
export type { EventItem };

// Creation sends canonical values, not the formatted strings shown in event cards.
// hostId is deliberately absent: the backend derives it from the Bearer session.
export interface CreateEventRequest {
  title: string;
  category: string;
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
}

export type UpdateEventRequest = Partial<CreateEventRequest>;

// Home/Search share this public list; the backend formats each EventItem response.
export async function fetchEvents(): Promise<EventItem[]> {
  const response = await api.get<{ events: EventItem[] }>('/events');
  return response.data.events;
}
// The shared client attaches Authorization; ownership is filtered by the server.
export async function fetchMyEvents(): Promise<EventItem[]> {
  const response = await api.get<{ events: EventItem[] }>('/events/mine');
  return response.data.events;
}
// Details always reload by the database ID instead of trusting a copied list item.
export async function fetchEvent(id: string): Promise<EventItem> {
  const response = await api.get<{ event: EventItem }>('/events/' + encodeURIComponent(id));
  return response.data.event;
}
// Return the saved server record so shared state uses its real ID and image URL.
// Image payloads get a longer timeout than the client's normal text-only requests.
export async function createEvent(input: CreateEventRequest): Promise<EventItem> {
  const response = await api.post<{ event: EventItem }>('/events', input, { timeout: 30000 });
  return response.data.event;
}

// Update an existing event record by ID with optional payload fields.
export async function updateEvent(id: string, input: UpdateEventRequest): Promise<EventItem> {
  const response = await api.patch<{ event?: EventItem } | EventItem>('/events/' + encodeURIComponent(id), input, { timeout: 30000 });
  const data = response.data;
  return ('event' in data && data.event) ? data.event : (data as EventItem);
}
// Independent saved choices belong to the authenticated account, never a client-supplied user ID.
export interface EventSelection {
  eventId: string;
  interested: boolean;
  attending: boolean;
}

export interface BookingHistoryItem extends EventSelection {
  id: string; // The selection record ID, used by the private history detail route.
  event: EventItem & { timeZone?: string };
}

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
  const response = await api.get<{ bookings: BookingHistoryItem[] }>('/event-selections/history', { signal });
  return response.data.bookings;
}

export async function fetchBookingHistoryDetails(id: string, signal?: AbortSignal): Promise<BookingHistoryItem> {
  const response = await api.get<{ booking: BookingHistoryItem }>(
    '/event-selections/history/' + encodeURIComponent(id), { signal },
  );
  return response.data.booking;
}

import { api } from './client';
import type { EventItem } from '../data/events';

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

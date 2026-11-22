import { api } from './client';
import { normalizeEvent } from './events';
import type { EventItem } from '../data/events';

export type TicketStatus = 'active' | 'used' | 'revoked' | 'expired';
export interface EventTicket {
  id: string;
  eventId: string;
  userId: string;
  registrationVersion: number;
  code: string;
  qrPayload: string;
  qrCodeDataUrl: string;
  status: TicketStatus;
  checkInOpensAt: string;
  checkInClosesAt: string;
  checkedInAt: string | null;
}
export interface TicketResponse { ticket: EventTicket; event: EventItem }
export interface TicketListItem {
  id: string | null;
  event: EventItem;
  attended: boolean;
  checkedInAt: string | null;
  status: TicketStatus;
}
export interface CheckInResponse {
  alreadyCheckedIn: boolean;
  attendee: { id: string; username: string; firstName: string; lastName: string };
  eventId: string;
  checkedInAt: string;
  attended: true;
  checkedInCount: number;
}
export type CheckInInput = { qrPayload: string; code?: never } | { code: string; qrPayload?: never };

// Only the signed-in ticket owner can retrieve credentials. Never cache these
// responses in public event records, navigation parameters, or console output.
export async function fetchEventTicket(eventId: string, signal?: AbortSignal): Promise<TicketResponse> {
  const response = await api.post<TicketResponse>('/events/' + encodeURIComponent(eventId) + '/ticket', {}, { signal });
  return { ...response.data, event: normalizeEvent(response.data.event) };
}

export async function fetchMyTickets(signal?: AbortSignal): Promise<TicketListItem[]> {
  const response = await api.get<{ tickets: TicketListItem[] }>('/events/tickets/me', { signal });
  return response.data.tickets.map(ticket => ({ ...ticket, event: normalizeEvent(ticket.event) }));
}

// Both scanner and manual entry use the same host-only validation endpoint.
export async function checkInEvent(eventId: string, input: CheckInInput): Promise<CheckInResponse> {
  const response = await api.post<CheckInResponse>('/events/' + encodeURIComponent(eventId) + '/check-in', input);
  return response.data;
}

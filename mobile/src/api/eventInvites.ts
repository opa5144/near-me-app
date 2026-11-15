import { api } from './client';
import type { EventItem } from '../data/events';

export interface EventInvite {
  id: string; eventId: string; senderId: string; recipientId: string;
  status: 'pending' | 'accepted' | 'declined'; read: boolean; canRespond: boolean;
  createdAt: string; respondedAt: string | null;
  sender: { id: string; username: string; firstName?: string; lastName?: string; avatar: string };
  event: EventItem;
}
export async function sendEventInvite(eventId: string, recipientId: string): Promise<EventInvite> {
  const { data } = await api.post<{ invite: EventInvite }>('/events/' + encodeURIComponent(eventId) + '/invite', { recipientId });
  return data.invite;
}
export async function fetchMyEventInvites(signal?: AbortSignal): Promise<EventInvite[]> {
  const { data } = await api.get<{ invites: EventInvite[] }>('/events/invites/me', { signal });
  return data.invites;
}
export async function fetchEventInvite(inviteId: string, signal?: AbortSignal): Promise<EventInvite> {
  const { data } = await api.get<{ invite: EventInvite }>('/events/invites/' + encodeURIComponent(inviteId), { signal });
  return data.invite;
}
export async function respondToEventInvite(inviteId: string, status: 'accepted' | 'declined'): Promise<EventInvite> {
  const { data } = await api.patch<{ invite: EventInvite }>('/events/invites/' + encodeURIComponent(inviteId), { status });
  return data.invite;
}
export async function markEventInviteRead(inviteId: string): Promise<EventInvite> {
  const { data } = await api.patch<{ invite: EventInvite }>('/events/invites/' + encodeURIComponent(inviteId), { read: true });
  return data.invite;
}

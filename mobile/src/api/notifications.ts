import { api } from './client';
import type { NotificationSettings } from './settings';

export const NOTIFICATION_TYPES = [
  'REGISTRATION_CONFIRMED', 'REGISTRATION_CANCELLED', 'EVENT_STARTS_24H', 'EVENT_STARTS_1H',
  'EVENT_CANCELLED', 'EVENT_DATETIME_CHANGED', 'EVENT_LOCATION_CHANGED',
  'SAVED_EVENT_REGISTRATION_CLOSING', 'FOLLOWED_ORGANIZER_NEW_EVENT', 'RATE_ATTENDED_EVENT',
  'EVENT_INVITE', 'FRIEND_REQUEST',
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];
export const NOTIFICATION_CHANNELS = ['inApp', 'push', 'email', 'sms'] as const;
export type NotificationChannel = typeof NOTIFICATION_CHANNELS[number];
export type ChannelChoices = Record<NotificationChannel, boolean>;
export type TypeChannelChoices = Partial<Record<NotificationType, Partial<ChannelChoices>>>;
export interface NotificationPreferences {
  settings: NotificationSettings;
  channels: ChannelChoices;
  typeChannels: TypeChannelChoices;
}
export type NotificationAction = { type: 'OPEN_EVENT' | 'RATE_EVENT'; eventId: string }
  | { type: 'OPEN_FRIEND_REQUEST'; requestId: string; actorId?: string };
export interface AppNotification {
  id: string;
  eventId: string | null;
  actorId: string | null;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown>;
  action: unknown;
  isRead: boolean;
  readAt: string | null;
  occurredAt: string;
  createdAt: string;
}
export interface InboxPage { notifications: AppNotification[]; nextCursor: string | null }

// Interpret only known app actions. Do not navigate to a route/URL supplied by stored data.
export function notificationAction(notification: AppNotification): NotificationAction | null {
  if (notification.type === 'FRIEND_REQUEST') {
    const requestId = notification.data.requestId;
    const action = notification.action;
    if (typeof requestId !== 'string' || !/^[a-f0-9]{24}$/i.test(requestId) ||
        !action || typeof action !== 'object' || Array.isArray(action)) return null;
    const candidate = action as Record<string, unknown>;
    if (candidate.type !== 'OPEN_FRIEND_REQUEST' || typeof candidate.requestId !== 'string' ||
        candidate.requestId.toLowerCase() !== requestId.toLowerCase()) return null;
    if (candidate.actorId !== undefined && (typeof candidate.actorId !== 'string' ||
        !/^[a-f0-9]{24}$/i.test(candidate.actorId) ||
        candidate.actorId.toLowerCase() !== notification.actorId?.toLowerCase())) return null;
    return { type: 'OPEN_FRIEND_REQUEST', requestId,
      ...(notification.actorId ? { actorId: notification.actorId } : {}) };
  }
  const eventId = notification.eventId;
  if (typeof eventId !== 'string' || !/^[a-f0-9]{24}$/i.test(eventId)) return null;
  const action = notification.action;
  if (action && typeof action === 'object' && !Array.isArray(action)) {
    const candidate = action as Record<string, unknown>;
    if ((candidate.type === 'OPEN_EVENT' || candidate.type === 'RATE_EVENT') &&
        typeof candidate.eventId === 'string' && candidate.eventId.toLowerCase() === eventId.toLowerCase()) {
      return { type: candidate.type, eventId };
    }
    return null;
  }
  if (action !== null && action !== undefined) return null;
  // Rating prompts created before the rating feature intentionally had no action.
  return notification.type === 'RATE_ATTENDED_EVENT' ? { type: 'RATE_EVENT', eventId } : null;
}
export async function fetchNotificationInbox(cursor?: string, signal?: AbortSignal): Promise<InboxPage> {
  const { data } = await api.get<InboxPage>('/notifications', { params: { limit: 20, ...(cursor ? { cursor } : {}) }, signal });
  return data;
}
export async function fetchNotificationUnreadCount(signal?: AbortSignal): Promise<number> {
  const { data } = await api.get<{ unreadCount: number }>('/notifications/unread-count', { signal });
  return data.unreadCount;
}
export async function setNotificationRead(id: string, read: boolean): Promise<AppNotification> {
  const { data } = await api.patch<{ notification: AppNotification }>('/notifications/' + encodeURIComponent(id) + '/read', { read });
  return data.notification;
}
export async function markAllNotificationsRead(): Promise<number> {
  const { data } = await api.post<{ updatedCount: number }>('/notifications/read-all', {});
  return data.updatedCount;
}
export async function fetchNotificationPreferences(signal?: AbortSignal): Promise<NotificationPreferences> {
  const { data } = await api.get<NotificationPreferences>('/notifications/preferences', { signal });
  return data;
}
export async function saveNotificationPreferences(changes: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
  const { data } = await api.patch<NotificationPreferences>('/notifications/preferences', changes);
  return data;
}

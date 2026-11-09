import { isAxiosError } from 'axios';
import { api } from './client';

export interface CitySuggestion {
  placeId: string;
  name: string;
  label: string;
}

export interface SubscribedCity extends CitySuggestion {
  subscribed: boolean;
  unavailable?: boolean;
}

export interface PreferencesResponse {
  categories: string[];
  preferences: {
    categories: Record<string, boolean>;
    cities: SubscribedCity[];
  };
}

export interface PreferencesUpdate {
  categories?: Record<string, boolean>;
  cities?: Array<{ placeId: string; subscribed: boolean }>;
}

export const NOTIFICATION_KEYS = [
  'phoneMaster', 'emailMaster', 'calendarSync', 'personalizedEmail',
  'cityEventsEmail', 'trendNewsletters', 'attendingEmailReminders',
  'attendingPhoneReminders', 'bookingInterestEmail', 'topEventsEmail',
  'organizerAnnounceEmail', 'organizerAnnouncePhone', 'followerEmail',
  'followerPhone', 'newMessageEmail', 'newMessagePhone', 'hostEventLiveEmail',
  'hostNewsletterEmail', 'hostNewCommentEmail',
] as const;

export type NotificationKey = typeof NOTIFICATION_KEYS[number];
export type NotificationSettings = Record<NotificationKey, boolean>;

export interface NotificationsResponse {
  settings: NotificationSettings;
  contacts: { email: string; phone: string };
}

interface SettingsErrorResponse {
  message?: string;
  errors?: Record<string, string>;
}

// Show useful validation details without retaining Axios errors or request data.
export function settingsErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError<SettingsErrorResponse>(error)) return fallback;
  const data = error.response?.data;
  const details = Object.values(data?.errors ?? {}).filter(value => typeof value === 'string' && value.trim());
  const message = typeof data?.message === 'string' && data.message.trim() ? data.message : fallback;
  return [message, ...new Set(details)].join('\n');
}

export async function fetchPreferences(signal?: AbortSignal): Promise<PreferencesResponse> {
  const { data } = await api.get<PreferencesResponse>('/settings/preferences', { signal });
  return data;
}

export async function updatePreferences(changes: PreferencesUpdate): Promise<PreferencesResponse> {
  const { data } = await api.patch<PreferencesResponse>('/settings/preferences', changes);
  return data;
}

export async function searchSettingsCities(query: string, signal?: AbortSignal): Promise<CitySuggestion[]> {
  const { data } = await api.get<{ cities: CitySuggestion[] }>('/settings/cities', {
    params: { q: query.trim() }, signal,
  });
  return data.cities;
}

export async function fetchNotificationSettings(signal?: AbortSignal): Promise<NotificationsResponse> {
  const { data } = await api.get<NotificationsResponse>('/settings/notifications', { signal });
  return data;
}

export async function updateNotificationSettings(settings: Partial<NotificationSettings>): Promise<NotificationsResponse> {
  const { data } = await api.patch<NotificationsResponse>('/settings/notifications', { settings });
  return data;
}

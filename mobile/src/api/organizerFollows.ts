import { api } from './client';

// An organizer is a User who hosts events; follows do not create a new account type.
export interface OrganizerFollow {
  id: string;
  organizerId: string;
  active: boolean;
  followedAt: string;
  organizer?: { id: string; username: string; firstName?: string; lastName?: string };
}

export async function fetchOrganizerFollows(signal?: AbortSignal): Promise<OrganizerFollow[]> {
  const { data } = await api.get<{ follows: OrganizerFollow[] }>('/organizer-follows', { signal });
  return data.follows;
}

export async function followOrganizer(userId: string): Promise<OrganizerFollow> {
  const { data } = await api.post<{ follow: OrganizerFollow }>('/organizer-follows/' + encodeURIComponent(userId), {});
  return data.follow;
}

export async function unfollowOrganizer(userId: string): Promise<void> {
  await api.delete('/organizer-follows/' + encodeURIComponent(userId));
}

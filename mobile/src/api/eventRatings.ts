import { api } from './client';

export interface RatingOption { score: number; emoji: string; label: string }
export interface EventRating { id: string; eventId: string; score: number; createdAt: string; updatedAt: string }
export interface RatingResponse {
  eventId: string;
  rating: EventRating | null;
  eligibility: { canRate: boolean; reason: string | null };
  scores: RatingOption[];
}
export interface RatingSummary {
  eventId: string;
  totalRatings: number;
  averageScore: number | null;
  counts: Array<RatingOption & { count: number }>;
}

// The server derives the reviewer from the session and supplies the shared score labels.
export async function fetchEventRating(eventId: string, signal?: AbortSignal): Promise<RatingResponse> {
  const { data } = await api.get<RatingResponse>('/events/' + encodeURIComponent(eventId) + '/rating', { signal });
  return data;
}
export async function saveEventRating(eventId: string, score: number): Promise<RatingResponse> {
  const { data } = await api.put<RatingResponse>('/events/' + encodeURIComponent(eventId) + '/rating', { score });
  return data;
}
export async function fetchEventRatingSummary(eventId: string, signal?: AbortSignal): Promise<RatingSummary> {
  const { data } = await api.get<RatingSummary>('/events/' + encodeURIComponent(eventId) + '/ratings/summary', { signal });
  return data;
}

import { api } from './client';
import type { PersistedPhoto, PhotoInput } from './photos';

export type StoreDay = 'Sunday' | 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';

// Recurring hours are local wall-clock times in the store's saved timezone, not dates.
export interface StoreBusinessHours {
  day: StoreDay;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
}

export interface StoreItem {
  id: string;
  ownerId: string | { _id: string; username: string; firstName?: string; lastName?: string };
  name: string;
  categories: string[];
  description: string;
  address: string;
  place: string;
  placeId?: string;
  latitude?: number | null;
  longitude?: number | null;
  timeZone: string;
  businessHours: StoreBusinessHours[];
  photos: PersistedPhoto[];
  bannerImage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStoreRequest {
  name: string;
  categories: string[];
  description: string;
  address: string;
  place: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
  timeZone: string;
  businessHours: StoreBusinessHours[];
  photos: PhotoInput[];
}

export async function fetchMyStores(signal?: AbortSignal): Promise<StoreItem[]> {
  const response = await api.get<{ stores: StoreItem[] }>('/stores/mine', { signal });
  return response.data.stores;
}

export async function fetchStore(id: string, signal?: AbortSignal): Promise<StoreItem> {
  const response = await api.get<{ store: StoreItem }>('/stores/' + encodeURIComponent(id), { signal });
  return response.data.store;
}

// The backend assigns ownership; a device-local image URI never enters this request.
export async function createStore(input: CreateStoreRequest): Promise<StoreItem> {
  const response = await api.post<{ store: StoreItem }>('/stores', input, { timeout: 60000 });
  return response.data.store;
}

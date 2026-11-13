import { api } from './client';

export interface PlaceSuggestion {
  placeId: string;
  primary: string;
  secondary: string;
  full: string;
}

export interface EventPlace {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export const createSessionToken = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export async function fetchPlaceSuggestions(input: string, sessionToken: string, signal?: AbortSignal): Promise<PlaceSuggestion[]> {
  if (input.trim().length < 3) return [];

  // Let the input distinguish a failed lookup from a successful empty result.
  const response = await api.post<any>('/maps/autocomplete', { input, sessionToken }, { signal });
  const data = response.data;
  return (data.suggestions ?? [])
    .filter((s: any) => s.placePrediction)
    .map((s: any) => ({
      placeId: s.placePrediction.placeId,
      primary: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text.text,
      secondary: s.placePrediction.structuredFormat?.secondaryText?.text ?? '',
      full: s.placePrediction.text.text,
    }));
}

export async function fetchPlaceDetails(placeId: string, sessionToken: string): Promise<EventPlace> {
  const response = await api.get<any>(`/maps/places/${encodeURIComponent(placeId)}?sessionToken=${sessionToken}`);
  const data = response.data;
  return {
    placeId: data.id,
    name: data.displayName?.text ?? '',
    address: data.formattedAddress ?? '',
    latitude: data.location.latitude,
    longitude: data.location.longitude,
  };
}

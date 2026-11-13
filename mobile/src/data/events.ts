// Backend event response shared by the screens. MongoDB _id is exposed as id.
// date/time/price are ready for display; startsAt/endsAt and priceAmount retain
// canonical values so future forms and calculations do not parse screen labels.
export type EventItem = {
  id: string;
  title: string;
  categories: string[];
  description: string;
  price: string;
  date: string;
  time: string;
  startsAt: string;
  endsAt: string;
  timeZone?: string;
  priceAmount?: number;
  venue: string;
  address: string;
  place?: string;
  placeId?: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  emoji: string;
  accent: string;
  bannerImage?: string;
  photos?: { id: string; url: string }[];
  // Server totals count active accounts, independently of this viewer's own choices.
  interestedCount?: number;
  attendingCount?: number;
  hostId?: {
    _id: string;
    username: string;
    firstName?: string;
    lastName?: string;
  } | string;
}

// All is a list filter. Saved events need one or more specific categories.
// Actual event records now come from the API, not an exported sample array.
export const categories = ['All', 'Music', 'Dance', 'Food', 'Film', 'Workshop', 'Art'];
export const eventCategories = categories.filter(category => category !== 'All');

// Older API records may contain one category. Normalize that bridge once at
// the API boundary so every screen works with the same ordered category array.
export function normalizeEventCategories(value: unknown, legacyCategory?: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof legacyCategory === 'string' ? [legacyCategory] : [];
  return [...new Set(source.filter((category): category is string => typeof category === 'string' && eventCategories.includes(category)))];
}

// Backend event response shared by the screens. MongoDB _id is exposed as id.
// date/time/price are ready for display; startsAt/endsAt and priceAmount retain
// canonical values so future forms and calculations do not parse screen labels.
export type EventItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  price: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  location?: string;
  latitude?: number | null;
  longitude?: number | null;
  emoji: string;
  accent: string;
  bannerImage?: string;
  hostId?: {
    _id: string;
    username: string;
    firstName?: string;
    lastName?: string;
  } | string;
}

// All is a list filter. Creation excludes it because every saved event needs a category.
// Actual event records now come from the API, not an exported sample array.
export const categories = ['All', 'Music', 'Dance', 'Food', 'Film', 'Workshop', 'Art'];

// Backend event response shared by the screens. MongoDB _id is exposed as id.
// date/time/price are ready for display; startsAt/endsAt and priceAmount retain
// canonical values so future forms and calculations do not parse screen labels.
export type EventItem = {
  id: string;
  hostId: string; // AccountList owner's ObjectId serialized as JSON text.
  title: string;
  category: string;
  date: string;
  time: string;
  venue: string; // Display alias for place, kept for the existing card components.
  price: string;
  description: string;
  emoji: string;
  accent: string;
  location: string; // Display alias for address.
  bannerImage?: string; // Absolute HTTP(S) URL returned by the upload API.
  priceAmount: number;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  address: string;
  place: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
};

// All is a list filter. Creation excludes it because every saved event needs a category.
// Actual event records now come from the API, not an exported sample array.
export const categories = ['All', 'Music', 'Dance', 'Food', 'Film', 'Workshop', 'Art'];

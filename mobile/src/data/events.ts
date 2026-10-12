export type EventItem = {
  id: string;
  title: string;
  category: string;
  date: string;
  time: string;
  venue: string;
  price: string;
  description: string;
  emoji: string;
  accent: string;
  location: string;
};

export const sampleEvents: EventItem[] = [
  { id: '1', title: 'Electric Oasis Festival', category: 'Music', date: 'Fri, Jun 12', time: '4:00 PM – 11:00 PM', venue: 'Sanders Dunes Dome', price: '$45', description: 'An electrifying lineup of DJs and live acts across three stages, with immersive light shows, art installations, and food trucks.', emoji: '🎆', accent: '#31245C', location: 'Downtown Venue' },
  { id: '2', title: 'Acoustic Sessions in the Garden', category: 'Music', date: 'Wed, Jun 17', time: '6:30 PM – 8:00 PM', venue: 'The Glasshouse Botanical Garden', price: 'Free', description: 'Unwind with intimate acoustic performances surrounded by lush greenery and warm evening lights.', emoji: '🎸', accent: '#315748', location: 'Botanical Garden' },
  { id: '3', title: 'Vaporwave Nights & Retro Beats', category: 'Music', date: 'Tonight', time: '9:00 PM – 1:00 AM', venue: 'Arcade Retro Bar', price: '$15', description: 'Retro visuals, synthwave DJs, arcade games, and a nostalgic late-night dance floor.', emoji: '🌆', accent: '#613F7E', location: 'Arcade District' },
  { id: '4', title: 'Boiler Room: Underground', category: 'Dance', date: 'Sat, Jun 13', time: '10:00 PM – 2:00 AM', venue: 'Warehouse District', price: '$30', description: 'A high-energy underground dance night featuring local selectors and immersive production.', emoji: '🔊', accent: '#783D32', location: 'Warehouse District' },
  { id: '5', title: 'Rooftop Cinema: Moonlight', category: 'Film', date: 'Fri, Sep 18', time: '8:30 PM', venue: 'The Skyline Rooftop', price: '$18', description: 'A cozy outdoor movie night with skyline views, snacks, and blankets under the stars.', emoji: '🎬', accent: '#416078', location: 'Skyline Rooftop' },
  { id: '6', title: 'Clay & Coffee Workshop', category: 'Workshop', date: 'Sun, Sep 20', time: '10:00 AM', venue: 'Common Grounds Studio', price: '$32', description: 'Try a beginner-friendly pottery session with coffee, materials, and guidance included.', emoji: '☕', accent: '#99724D', location: 'Arts Quarter' },
  { id: '7', title: 'Jazz & Aperitivo Sunday', category: 'Food', date: 'Sun, Jun 21', time: '5:00 PM – 8:00 PM', venue: 'Caffè Milano Plaza', price: '$20', description: 'Live jazz, small plates, and relaxed patio vibes for a slow Sunday evening.', emoji: '🍸', accent: '#78623A', location: 'Milano Plaza' },
];

export const categories = ['All', 'Music', 'Dance', 'Food', 'Film', 'Workshop', 'Art'];

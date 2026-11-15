
export type StoreItem = {
  id: string
  name: string
  category: string
  description: string
  address: string
  emoji: string
  accent: string
  bannerImage?: string
}

export const sampleStores: StoreItem[] = [
  {
    id: 'store-1',
    name: 'The Copper Kettle',
    category: 'Food',
    description: 'A cozy local cafe offering coffee, baked goods, and freshly prepared meals.',
    address: 'Downtown Erie, PA',
    emoji: '☕',
    accent: '#D9A477',
  },
  {
    id: 'store-2',
    name: 'North Shore Outfitters',
    category: 'Retail',
    description: 'Outdoor equipment, clothing, and accessories for your next adventure.',
    address: 'Erie, PA',
    emoji: '🏕️',
    accent: '#85A99A',
  },
  {
    id: 'store-3',
    name: 'Canvas & Clay Studio',
    category: 'Art',
    description: 'An art studio featuring handmade crafts, pottery, and creative workshops.',
    address: 'Downtown Erie, PA',
    emoji: '🎨',
    accent: '#C58E9B',
  },
  {
    id: 'store-4',
    name: 'Main Street Threads',
    category: 'Clothing',
    description: 'A small clothing shop featuring everyday fashion and locally inspired designs.',
    address: 'Erie, PA',
    emoji: '👕',
    accent: '#899BC5',
  },
  {
    id: 'store-5',
    name: 'The Game Corner',
    category: 'Entertainment',
    description: 'A community hangout for tabletop games, collectibles, and gaming events.',
    address: 'Erie, PA',
    emoji: '🎮',
    accent: '#A58BC5',
  },
]

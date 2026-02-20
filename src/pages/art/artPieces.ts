interface ArtPiece {
  id: number;
  title: string;
  artist: string;
  description: string;
  date: string;
  views: number;
  likes: number;
  color: string;
}

export const artPieces: ArtPiece[] = [
  {
    id: 1,
    title: 'Morning to Midnight',
    artist: 'Alex Chen',
    description: "A serene transition from dawn's first light to the electric energy of city nightlife.",
    date: '2024-01-15',
    views: 1240,
    likes: 89,
    color: 'wes-vintage-gold'
  },
  {
    id: 2,
    title: 'Seasonal Metamorphosis',
    artist: 'Sarah Johnson',
    description: 'Watch as autumn leaves transform through winter snow into spring blossoms.',
    date: '2024-01-12',
    views: 892,
    likes: 156,
    color: 'wes-coral'
  },
  {
    id: 3,
    title: 'Ocean Dreams',
    artist: 'Marcus Rivera',
    description: 'A meditative flow between calm waters and turbulent waves of emotion.',
    date: '2024-01-10',
    views: 2103,
    likes: 234,
    color: 'wes-sage'
  },
  {
    id: 4,
    title: 'Urban Solitude',
    artist: 'Emma Thompson',
    description: 'The quiet moments found in bustling city streets, from rush hour to stillness.',
    date: '2024-01-08',
    views: 756,
    likes: 67,
    color: 'wes-lavender'
  },
  {
    id: 5,
    title: 'Memory Palace',
    artist: 'David Kim',
    description: 'Childhood memories flowing into adult perspectives through time and space.',
    date: '2024-01-05',
    views: 1543,
    likes: 198,
    color: 'wes-pink'
  },
  {
    id: 6,
    title: 'Digital Analog',
    artist: 'Zoe Martinez',
    description: 'The bridge between vintage film photography and modern digital artistry.',
    date: '2024-01-03',
    views: 987,
    likes: 123,
    color: 'wes-mustard'
  }
];

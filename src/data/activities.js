// Sample activities / places. Realistic sensory profiles and crowd-by-hour curves.
// Crowd is on a 0-5 scale per hour-of-day, indexed 0..23.

export const ACTIVITIES = [
  {
    id: 'museum-quiet',
    name: 'Quiet Art Museum',
    category: 'culture',
    location: 'City Centre',
    sensory: { noise: 1, crowds: 2, light: 2, unpredictability: 1 },
    description: 'Spacious galleries with bench seating in every room. No flash photography.',
    crowdByHour: [0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0],
  },
  {
    id: 'park-riverside',
    name: 'Riverside Park Walk',
    category: 'outdoors',
    location: 'River Path',
    sensory: { noise: 1, crowds: 1, light: 3, unpredictability: 1 },
    description: 'Paved path, predictable loop, shaded benches every 200m.',
    crowdByHour: [0,0,0,0,0,1,2,3,3,3,2,2,2,2,3,3,4,4,3,1,0,0,0,0],
  },
  {
    id: 'cafe-small',
    name: 'Quiet Independent Café',
    category: 'food',
    location: 'Maple Street',
    sensory: { noise: 2, crowds: 2, light: 2, unpredictability: 1 },
    description: 'Eight seats, soft music, ordering at the counter. No background TV.',
    crowdByHour: [0,0,0,0,0,0,1,3,4,4,3,2,3,3,2,2,1,1,0,0,0,0,0,0],
  },
  {
    id: 'aquarium',
    name: 'City Aquarium',
    category: 'culture',
    location: 'Harbour',
    sensory: { noise: 2, crowds: 3, light: 2, unpredictability: 1 },
    description: 'Quiet underwater lighting, predictable one-way route, sensory map at entry.',
    crowdByHour: [0,0,0,0,0,0,0,1,2,3,4,4,4,3,3,2,2,1,0,0,0,0,0,0],
  },
  {
    id: 'market-food',
    name: 'Indoor Food Market',
    category: 'food',
    location: 'Old Warehouse',
    sensory: { noise: 4, crowds: 4, light: 3, unpredictability: 3 },
    description: 'Many vendors, queueing, varied smells. Often busy lunch and dinner.',
    crowdByHour: [0,0,0,0,0,0,0,1,3,4,5,5,5,4,3,3,4,5,5,4,2,0,0,0],
  },
  {
    id: 'concert-orchestra',
    name: 'Orchestra Concert',
    category: 'culture',
    location: 'Concert Hall',
    sensory: { noise: 4, crowds: 3, light: 2, unpredictability: 2 },
    description: 'Fixed seating, programme known in advance, no intermission required.',
    crowdByHour: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,4,4,3,0,0],
  },
  {
    id: 'festival-outdoor',
    name: 'Outdoor Music Festival',
    category: 'event',
    location: 'Showground',
    sensory: { noise: 5, crowds: 5, light: 4, unpredictability: 5 },
    description: 'Long unstructured day, loud stages, large crowds. High demand.',
    crowdByHour: [0,0,0,0,0,0,0,0,0,2,3,4,5,5,5,5,5,5,5,4,3,1,0,0],
  },
  {
    id: 'library',
    name: 'Public Library Reading Room',
    category: 'rest',
    location: 'Civic Square',
    sensory: { noise: 0, crowds: 1, light: 2, unpredictability: 0 },
    description: 'Silent zone, no phone calls, stable lighting. Strong recovery space.',
    crowdByHour: [0,0,0,0,0,0,0,1,1,2,2,2,2,2,2,2,1,1,0,0,0,0,0,0],
  },
  {
    id: 'spa-sauna',
    name: 'Spa & Sauna',
    category: 'rest',
    location: 'Wellness Centre',
    sensory: { noise: 1, crowds: 1, light: 1, unpredictability: 1 },
    description: 'Bookable time slots, quiet zones, dim lighting. Excellent reset.',
    crowdByHour: [0,0,0,0,0,0,1,1,2,3,3,2,2,2,2,2,3,3,2,1,0,0,0,0],
  },
  {
    id: 'theme-park',
    name: 'Theme Park',
    category: 'event',
    location: 'Outskirts',
    sensory: { noise: 4, crowds: 5, light: 3, unpredictability: 4 },
    description: 'Queues, sudden loud rides, dense crowds. Often overwhelming without breaks.',
    crowdByHour: [0,0,0,0,0,0,0,0,1,3,4,5,5,5,5,5,5,4,3,2,1,0,0,0],
  },
  {
    id: 'hiking-trail',
    name: 'Forest Hiking Trail',
    category: 'outdoors',
    location: 'National Park',
    sensory: { noise: 1, crowds: 1, light: 3, unpredictability: 2 },
    description: 'Marked trail, natural sounds, picnic spots. Take water and a plan.',
    crowdByHour: [0,0,0,0,0,1,2,3,3,3,2,2,2,2,3,3,4,4,2,1,0,0,0,0],
  },
  {
    id: 'arcade',
    name: 'Indoor Arcade',
    category: 'event',
    location: 'Entertainment District',
    sensory: { noise: 5, crowds: 4, light: 4, unpredictability: 3 },
    description: 'Flashing lights, loud machines, dense foot traffic. Not for low-tolerance users.',
    crowdByHour: [0,0,0,0,0,0,0,0,1,2,3,4,4,4,5,5,5,5,4,3,2,1,0,0],
  },
]

export function getActivityById(id, pool) {
  // If a pool is supplied (e.g. the city's landmarks merged with the generic
  // catalogue), look in there first, then fall back to the generic catalogue.
  // This keeps ItineraryEditor and SensoryBudget working with whatever the
  // LLM put on the day, regardless of which city it came from.
  if (pool && pool !== ACTIVITIES) {
    const hit = pool.find(a => a.id === id)
    if (hit) return hit
  }
  return ACTIVITIES.find(a => a.id === id)
}

// Sample activities / places. Realistic sensory profiles and crowd-by-hour curves.
// Crowd is on a 0-5 scale per hour-of-day, indexed 0..23.

// How long each visit type typically takes (in hours).
// These are base estimates — Google Places data refines them further.
export const VISIT_HOURS = {
  light: 1,
  moderate: 2.5,
  intense: 6,
}

// Refined duration ranges by category for more granular estimates.
export const CATEGORY_HOURS = {
  // Theme parks and major attractions take a full day
  event: { light: 1.5, moderate: 3, intense: 8 },
  // Culture varies widely
  culture: { light: 1, moderate: 2.5, intense: 4 },
  // Outdoors depends on activity
  outdoors: { light: 1, moderate: 2, intense: 4 },
  // Food is usually quick
  food: { light: 1, moderate: 1.5, intense: 2.5 },
  // Rest activities
  rest: { light: 1, moderate: 2, intense: 3 },
}

// Filler activities for itinerary day-structuring (transit, meals, prep).
// Exported separately so they don't appear in the "Add activity" list.
export const FILLER_ACTIVITIES = [
  {
    id: 'travel-transit',
    name: 'Travel / Commute',
    category: 'rest',
    location: 'En route',
    sensory: { noise: 0, crowds: 0, light: 0, unpredictability: 0 },
    description: 'Time spent travelling between locations.',
    crowdByHour: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    visitType: 'light',
  },
  {
    id: 'meal-lunch',
    name: 'Lunch Break',
    category: 'food',
    location: 'Nearby',
    sensory: { noise: 1, crowds: 1, light: 2, unpredictability: 0 },
    description: 'Time for a meal and rest during the day.',
    crowdByHour: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    visitType: 'light',
  },
  {
    id: 'meal-dinner',
    name: 'Dinner Break',
    category: 'food',
    location: 'Nearby',
    sensory: { noise: 1, crowds: 1, light: 2, unpredictability: 0 },
    description: 'Evening meal to refuel and unwind.',
    crowdByHour: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    visitType: 'light',
  },
  {
    id: 'getting-ready',
    name: 'Getting Ready',
    category: 'rest',
    location: 'Accommodation',
    sensory: { noise: 0, crowds: 0, light: 1, unpredictability: 0 },
    description: 'Morning preparation before heading out.',
    crowdByHour: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    visitType: 'light',
  },
  {
    id: 'meal-breakfast',
    name: 'Breakfast',
    category: 'food',
    location: 'Nearby',
    sensory: { noise: 1, crowds: 1, light: 2, unpredictability: 0 },
    description: 'Morning meal to start the day.',
    crowdByHour: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    visitType: 'light',
  },
]

// Extra interest activities that users can add to their day (shopping, spa, etc.)
export const EXTRA_INTERESTS = [
  {
    id: 'shopping-mall',
    name: 'Shopping Trip',
    category: 'event',
    location: 'Shopping District',
    sensory: { noise: 3, crowds: 3, light: 3, unpredictability: 2 },
    description: 'A relaxed shopping trip — browse stores, hunt for souvenirs, or explore local markets.',
    crowdByHour: [0,0,0,0,0,0,0,0,1,2,3,4,4,4,4,4,4,4,3,2,1,0,0,0],
    visitType: 'light',
  },
  {
    id: 'spa-afternoon',
    name: 'Spa / Wellness Afternoon',
    category: 'rest',
    location: 'Wellness Centre',
    sensory: { noise: 1, crowds: 1, light: 1, unpredictability: 1 },
    description: 'Massages, sauna, or quiet relaxation time. Bookable slots available.',
    crowdByHour: [0,0,0,0,0,0,0,0,1,2,3,3,3,3,3,3,3,2,2,1,0,0,0,0],
    visitType: 'moderate',
  },
  {
    id: 'local-market',
    name: 'Local Market / Bazaar',
    category: 'food',
    location: 'Market Square',
    sensory: { noise: 3, crowds: 4, light: 2, unpredictability: 3 },
    description: 'Browse a bustling local market with fresh produce, handicrafts, and street food.',
    crowdByHour: [0,0,0,0,0,0,0,1,2,3,4,5,5,4,3,3,4,4,3,2,1,0,0,0],
    visitType: 'moderate',
  },
]

export const ACTIVITIES = [
  {
    id: 'museum-quiet',
    name: 'Quiet Art Museum',
    category: 'culture',
    location: 'City Centre',
    sensory: { noise: 1, crowds: 2, light: 2, unpredictability: 1 },
    description: 'Spacious galleries with bench seating in every room. No flash photography.',
    crowdByHour: [0,0,0,0,0,0,0,0,1,2,2,2,2,2,2,2,2,1,0,0,0,0,0,0],
    visitType: 'moderate',
  },
  {
    id: 'park-riverside',
    name: 'Riverside Park Walk',
    category: 'outdoors',
    location: 'River Path',
    sensory: { noise: 1, crowds: 1, light: 3, unpredictability: 1 },
    description: 'Paved path, predictable loop, shaded benches every 200m.',
    crowdByHour: [0,0,0,0,0,1,2,3,3,3,2,2,2,2,3,3,4,4,3,1,0,0,0,0],
    visitType: 'light',
  },
  {
    id: 'cafe-small',
    name: 'Quiet Independent Café',
    category: 'food',
    location: 'Maple Street',
    sensory: { noise: 2, crowds: 2, light: 2, unpredictability: 1 },
    description: 'Eight seats, soft music, ordering at the counter. No background TV.',
    crowdByHour: [0,0,0,0,0,0,1,3,4,4,3,2,3,3,2,2,1,1,0,0,0,0,0,0],
    visitType: 'light',
  },
  {
    id: 'aquarium',
    name: 'City Aquarium',
    category: 'culture',
    location: 'Harbour',
    sensory: { noise: 2, crowds: 3, light: 2, unpredictability: 1 },
    description: 'Quiet underwater lighting, predictable one-way route, sensory map at entry.',
    crowdByHour: [0,0,0,0,0,0,0,1,2,3,4,4,4,3,3,2,2,1,0,0,0,0,0,0],
    visitType: 'moderate',
  },
  {
    id: 'market-food',
    name: 'Indoor Food Market',
    category: 'food',
    location: 'Old Warehouse',
    sensory: { noise: 4, crowds: 4, light: 3, unpredictability: 3 },
    description: 'Many vendors, queueing, varied smells. Often busy lunch and dinner.',
    crowdByHour: [0,0,0,0,0,0,0,1,3,4,5,5,5,4,3,3,4,5,5,4,2,0,0,0],
    visitType: 'moderate',
  },
  {
    id: 'concert-orchestra',
    name: 'Orchestra Concert',
    category: 'culture',
    location: 'Concert Hall',
    sensory: { noise: 4, crowds: 3, light: 2, unpredictability: 2 },
    description: 'Fixed seating, programme known in advance, no intermission required.',
    crowdByHour: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,4,4,3,0,0],
    visitType: 'moderate',
  },
  {
    id: 'festival-outdoor',
    name: 'Outdoor Music Festival',
    category: 'event',
    location: 'Showground',
    sensory: { noise: 5, crowds: 5, light: 4, unpredictability: 5 },
    description: 'Long unstructured day, loud stages, large crowds. High demand.',
    crowdByHour: [0,0,0,0,0,0,0,0,0,2,3,4,5,5,5,5,5,5,5,4,3,1,0,0],
    visitType: 'intense',
  },
  {
    id: 'library',
    name: 'Public Library Reading Room',
    category: 'rest',
    location: 'Civic Square',
    sensory: { noise: 0, crowds: 1, light: 2, unpredictability: 0 },
    description: 'Silent zone, no phone calls, stable lighting. Strong recovery space.',
    crowdByHour: [0,0,0,0,0,0,0,1,1,2,2,2,2,2,2,2,1,1,0,0,0,0,0,0],
    visitType: 'light',
  },
  {
    id: 'spa-sauna',
    name: 'Spa & Sauna',
    category: 'rest',
    location: 'Wellness Centre',
    sensory: { noise: 1, crowds: 1, light: 1, unpredictability: 1 },
    description: 'Bookable time slots, quiet zones, dim lighting. Excellent reset.',
    crowdByHour: [0,0,0,0,0,0,1,1,2,3,3,2,2,2,2,2,3,3,2,1,0,0,0,0],
    visitType: 'moderate',
  },
  {
    id: 'theme-park',
    name: 'Theme Park',
    category: 'event',
    location: 'Outskirts',
    sensory: { noise: 4, crowds: 5, light: 3, unpredictability: 4 },
    description: 'Queues, sudden loud rides, dense crowds. Often overwhelming without breaks.',
    crowdByHour: [0,0,0,0,0,0,0,0,1,3,4,5,5,5,5,5,5,4,3,2,1,0,0,0],
    visitType: 'intense',
  },
  {
    id: 'hiking-trail',
    name: 'Forest Hiking Trail',
    category: 'outdoors',
    location: 'National Park',
    sensory: { noise: 1, crowds: 1, light: 3, unpredictability: 2 },
    description: 'Marked trail, natural sounds, picnic spots. Take water and a plan.',
    crowdByHour: [0,0,0,0,0,1,2,3,3,3,2,2,2,2,3,3,4,4,2,1,0,0,0,0],
    visitType: 'moderate',
  },
  {
    id: 'arcade',
    name: 'Indoor Arcade',
    category: 'event',
    location: 'Entertainment District',
    sensory: { noise: 5, crowds: 4, light: 4, unpredictability: 3 },
    description: 'Flashing lights, loud machines, dense foot traffic. Not for low-tolerance users.',
    crowdByHour: [0,0,0,0,0,0,0,0,1,2,3,4,4,4,5,5,5,5,4,3,2,1,0,0],
    visitType: 'light',
  },
]

/**
 * Get a realistic visit duration estimate for an activity.
 * Uses Google Places data (rating, review count, category) when available
 * to refine the base visit type estimate.
 *
 * @param {object} activity — activity object with visitType, category, rating, userRatingCount
 * @returns {number} estimated hours
 */
export function estimateHours(activity) {
  if (!activity) return 1

  const baseType = activity.visitType || 'moderate'
  const categoryHours = CATEGORY_HOURS[activity.category] || CATEGORY_HOURS.culture
  let hours = categoryHours[baseType] || VISIT_HOURS[baseType] || 2.5

  // Google Places refinement: popular places have queues, but most landmarks
  // are still quick visits. Small bump only for extremely popular spots.
  const rating = activity.rating || 0
  const reviews = activity.userRatingCount || 0

  if (reviews > 10000) hours += 0.5
  else if (reviews > 5000) hours += 0.25

  // Known all-day attractions by name or ID
  const id = activity.id || ''
  const name = (activity.name || '').toLowerCase()
  if (/disney|universal|wizarding/i.test(id) || /disney|universal\s+(studios|orlando|hollywood)|wizarding world/i.test(name)) hours = 8
  if (/everglades|great-ocean-road|rottnest|st-martins/i.test(id)) hours = 7

  // Google Places type-based refinements
  if (activity._source === 'google' && activity.types) {
    const types = activity.types || []
    if (types.includes('amusement_park') || types.includes('theme_park')) hours = Math.max(hours, 7)
    if (types.includes('tourist_attraction') && !types.includes('museum') && !types.includes('historical_place') && !types.includes('church')) {
      // Generic tourist attraction — keep as moderate unless name suggests otherwise
    }
  }
  // Curated city museums known to be large
  if (/louvre|british-museum|metropolitan/i.test(id)) hours = Math.max(hours, 3.5)

  // Event-category places with very high review counts are likely theme parks
  if (activity.category === 'event' && reviews > 2000) hours = Math.max(hours, 6)

  return Math.round(hours * 10) / 10
}

export function getActivityById(id, pool) {
  // If a pool is supplied (e.g. the city's landmarks merged with the generic
  // catalogue), look in there first, then fall back to the generic catalogue.
  // This keeps ItineraryEditor and SensoryBudget working with whatever the
  // LLM put on the day, regardless of which city it came from.
  if (pool && pool !== ACTIVITIES) {
    const hit = pool.find(a => a.id === id)
    if (hit) return hit
  }
  // Also check filler activities (transit, meals, etc.)
  const filler = FILLER_ACTIVITIES.find(a => a.id === id)
  if (filler) return filler
  return ACTIVITIES.find(a => a.id === id)
}

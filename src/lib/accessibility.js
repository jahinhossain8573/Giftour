// Accessibility information for neurodivergent-friendly attractions.
// Sources: official park accessibility pages, IBCCES certification, known sensory-friendly programs.

// Known attractions with accessibility programs for neurodivergent visitors.
const ACCESSIBLE_PLACES = {
  // Theme parks with official autism / accessibility programs
  'disney': { badges: ['Disability Access Service (DAS)', 'Quiet rooms available'], level: 'high' },
  'universal': { badges: ['Attraction Assistance Pass (AAP)', 'Quiet rooms available'], level: 'high' },
  'seaworld': { badges: ['Sensory Guide available', 'Quiet room available'], level: 'high' },
  'busch gardens': { badges: ['Sensory Guide available'], level: 'medium' },
  'six flags': { badges: ['Sensory Guide available'], level: 'medium' },

  // Museums with accessibility programs
  'british-museum': { badges: ['Quiet hours', 'Sensory map at entry'], level: 'high' },
  'louvre': { badges: ['Quiet mornings available'], level: 'medium' },
  'tate-modern': { badges: ['Quiet hours', 'Member-only quiet spaces'], level: 'high' },
  'met': { badges: ['Sensory map', 'Quiet spaces'], level: 'high' },
  'moma': { badges: ['Quiet hours on Friday evenings'], level: 'medium' },
  'getty': { badges: ['Free admission', 'Spacious gardens', 'Tram access'], level: 'high' },
  'broad': { badges: ['Free timed entry', 'Spacious galleries'], level: 'high' },
  'ngv': { badges: ['Free entry', 'Quiet spaces'], level: 'medium' },
  'national-gallery': { badges: ['Quiet hours', 'Sensory resources'], level: 'medium' },

  // Parks and outdoor spaces
  'central-park': { badges: ['Open space', 'Benches throughout', 'Predictable paths'], level: 'high' },
  'hyde-park': { badges: ['Open space', 'Paved paths', 'Benches'], level: 'high' },
  'high-park': { badges: ['Trails', 'Gardens', 'Benches'], level: 'high' },
  'kings-park': { badges: ['Open space', 'Botanic garden', 'Benches'], level: 'high' },
  'royal-botanic': { badges: ['Free guided walks', 'Benches', 'Open space'], level: 'high' },

  // Aquariums and zoos
  'aquarium': { badges: ['Dim lighting', 'Sensory map', 'Quiet areas'], level: 'medium' },
  'london-zoo': { badges: ['Sensory map', 'Quiet mornings'], level: 'medium' },
  'taronga': { badges: ['Accessible paths', 'Ferry access'], level: 'medium' },
  'lone-pine': { badges: ['Open sanctuary', 'Quiet areas'], level: 'high' },

  // Known quiet/cafe spots
  'cafe': { badges: ['Quiet environment'], level: 'high' },
  'library': { badges: ['Silent zone', 'Stable lighting'], level: 'high' },
  'spa': { badges: ['Bookable slots', 'Dim lighting', 'Quiet zones'], level: 'high' },
}

/**
 * Check if an activity has accessibility accommodations for neurodivergent visitors.
 * @param {object} activity — activity object with id, name, category
 * @returns {{ level: 'high'|'medium'|'low', badges: string[] }}
 */
export function accessibilityInfo(activity) {
  if (!activity) return { level: 'low', badges: [] }

  const id = activity.id || ''
  const name = (activity.name || '').toLowerCase()

  // Check for known accessible places by ID
  for (const [key, info] of Object.entries(ACCESSIBLE_PLACES)) {
    if (id.includes(key) || name.includes(key)) {
      return info
    }
  }

  // Category-based defaults
  const category = activity.category || ''
  if (category === 'rest') return { level: 'high', badges: ['Recovery / low-stimulus activity'] }
  if (category === 'outdoors') return { level: 'medium', badges: ['Open space'] }
  if (category === 'food') return { level: 'medium', badges: [] }
  if (category === 'event') return { level: 'low', badges: [] }

  return { level: 'low', badges: [] }
}

/**
 * Get a badge label for the accessibility level.
 */
export function accessibilityBadge(activity) {
  const info = accessibilityInfo(activity)
  if (info.level === 'high') return '♾️ Friendly'
  if (info.level === 'medium') return '♾️ Moderate'
  return ''
}
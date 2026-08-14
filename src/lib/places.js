// Resolves a free-form destination string into a list of activities the LLM
// can pick from.
//
// Priority order:
// 1. Google Places API (if VITE_GOOGLE_MAPS_API_KEY is set) — real places
// 2. Static curated cities (src/data/cities.js) — fallback for known cities
// 3. Generic catalogue (src/data/activities.js) — fallback for anything else
//
// The generic ACTIVITIES catalogue is always included so the user can
// hand-pick calm baseline options even when API data is available.

import { ACTIVITIES } from '../data/activities.js'
import { CITIES } from '../data/cities.js'
import { fetchPlaces } from './places-api.js'

// Match a free-form destination string against the city aliases. We do
// substring matching (so "central london" and "greater london" both hit
// the london entry) and try the longest alias first to avoid a short alias
// shadowing a longer one.
export function matchCity(destination) {
  const q = (destination || '').toLowerCase().trim()
  if (!q) return null
  const cities = Object.values(CITIES)
  // Sort aliases by length descending so the most specific match wins.
  const candidates = []
  for (const city of cities) {
    for (const alias of city.aliases) {
      candidates.push({ city, alias })
    }
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length)
  for (const { city, alias } of candidates) {
    if (q.includes(alias)) return city
  }
  return null
}

// Returns { places, matched }. `places` is what the LLM gets to pick from;
// `matched` is the human-readable city name (or null) for the UI to show
// hints. The original generic catalogue is always included so the user can
// still hand-pick calm baseline options.
export async function resolvePlaces(destination) {
  // Step 1: Try Google Places API.
  const apiPlaces = await fetchPlaces(destination)
  if (apiPlaces) {
    return {
      places: [...apiPlaces, ...ACTIVITIES],
      matched: destination,
      source: 'google',
    }
  }

  // Step 2: Fall back to static curated city data.
  const city = matchCity(destination)
  if (city) {
    return {
      places: [...city.landmarks, ...ACTIVITIES],
      matched: city.name,
      source: 'static',
    }
  }

  // Step 3: Generic fallback.
  return { places: [...ACTIVITIES], matched: null, source: 'generic' }
}
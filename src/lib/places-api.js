// Google Places API (New) integration.
//
// Wraps the Text Search and Place Details endpoints to return Giftour-shaped
// activity objects with derived sensory profiles and estimated crowd curves.
//
// The API key is read from VITE_GOOGLE_MAPS_API_KEY. If no key is present
// (the default), every function returns null / [] and the app falls back
// to the static city data in src/data/cities.js.
//
// Field mask targets the Pro/Enterprise SKU tiers. See:
// https://developers.google.com/maps/documentation/places/web-service/usage-and-billing

const BASE = 'https://places.googleapis.com/v1'

// Fields we request — keep in sync with the shape mapping below.
const FIELDS = [
  'places.displayName',
  'places.formattedAddress',
  'places.types',
  'places.primaryType',
  'places.id',
  'places.editorialSummary',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.regularOpeningHours',
  'places.outdoorSeating',
  'places.liveMusic',
  'places.websiteUri',
].join(',')

// ─── Category mapping ─────────────────────────────────────────────────

const CATEGORY_MAP = [
  { types: ['museum', 'art_gallery', 'tourist_attraction', 'historical_landmark', 'historical_place', 'church', 'cathedral', 'mosque', 'temple', 'hindu_temple', 'synagogue', 'place_of_worship', 'city_hall', 'monument', 'castle', 'embassy', 'government_office'], category: 'culture' },
  { types: ['park', 'garden', 'natural_feature', 'campground', 'hiking_area', 'national_park', 'state_park', 'playground', 'dog_park', 'marina', 'beach', 'rv_park', 'zoo', 'aquarium', 'botanical_garden', 'wildlife_park'], category: 'outdoors' },
  { types: ['restaurant', 'cafe', 'bakery', 'bar', 'pub', 'meal_takeaway', 'meal_delivery', 'fast_food', 'food', 'grocery_store', 'supermarket', 'convenience_store', 'liquor_store', 'butcher', 'bakery'], category: 'food' },
  { types: ['library', 'spa', 'wellness_center', 'beauty_salon', 'hair_care', 'gym', 'health', 'doctor', 'dentist', 'pharmacy', 'hospital', 'physiotherapist', 'yoga_studio', 'massage'], category: 'rest' },
  { types: ['night_club', 'casino', 'movie_theater', 'movie_rental', 'stadium', 'sports_club', 'sports_complex', 'bowling_alley', 'amusement_center', 'amusement_park', 'performing_arts_theater', 'concert_hall', 'event_venue', 'convention_center'], category: 'event' },
]

function mapCategory(types) {
  if (!types || !types.length) return 'culture'
  for (const entry of CATEGORY_MAP) {
    for (const t of types) {
      if (entry.types.includes(t)) return entry.category
    }
  }
  return 'culture'
}

// ─── Sensory inference ────────────────────────────────────────────────

const BASE_SENSORY = {
  culture:  { noise: 2, crowds: 3, light: 2, unpredictability: 1 },
  outdoors: { noise: 1, crowds: 2, light: 3, unpredictability: 1 },
  food:     { noise: 3, crowds: 3, light: 2, unpredictability: 2 },
  rest:     { noise: 1, crowds: 1, light: 2, unpredictability: 1 },
  event:    { noise: 4, crowds: 4, light: 3, unpredictability: 4 },
}

function inferSensory(place, category) {
  const base = { ...(BASE_SENSORY[category] || BASE_SENSORY.culture) }
  // Modifiers based on available metadata.
  const rating = place.rating || 0
  const price = place.priceLevel ?? 1
  if (rating >= 4.5) {
    base.crowds = Math.min(5, base.crowds + 0.5)
  }
  if (price <= 1) {
    base.crowds = Math.min(5, base.crowds + 0.5)
  }
  if (price >= 3) {
    base.noise = Math.min(5, base.noise + 0.5)
  }
  if (place.outdoorSeating) {
    base.noise = Math.max(0, base.noise - 0.5)
    base.light = Math.max(0, base.light - 0.5)
  }
  if (place.liveMusic) {
    base.noise = Math.min(5, base.noise + 1.5)
  }
  // Clamp and round to one decimal.
  for (const k of ['noise', 'crowds', 'light', 'unpredictability']) {
    base[k] = Math.round(Math.min(5, Math.max(0, base[k])) * 10) / 10
  }
  return base
}

// ─── Crowd curve estimation ───────────────────────────────────────────

const CROWD_TEMPLATES = {
  culture:  [0,0,0,0,0,0,0,1,2,3,4,4,4,3,3,3,3,2,1,0,0,0,0,0],
  outdoors: [0,0,0,0,0,0,1,2,3,3,2,2,2,2,3,3,4,3,2,1,0,0,0,0],
  food:     [0,0,0,0,0,0,0,0,1,2,3,4,5,4,3,2,2,3,4,3,2,1,0,0],
  rest:     [0,0,0,0,0,0,1,2,2,3,3,2,2,2,2,3,3,2,1,0,0,0,0,0],
  event:    [0,0,0,0,0,0,0,0,0,1,2,3,4,5,5,5,5,5,5,4,3,2,1,0],
}

function inferCrowdCurve(place, category) {
  const template = [...(CROWD_TEMPLATES[category] || CROWD_TEMPLATES.culture)]
  // Scale by popularity (rating) and price.
  const rating = place.rating || 0
  const price = place.priceLevel ?? 1
  const scale = 1 + (rating - 3) * 0.15 + (price <= 1 ? 0.2 : 0) + (price >= 3 ? -0.15 : 0)
  const scaled = template.map(v => Math.min(5, Math.max(0, Math.round(v * scale))))

  // Zero out hours when the place is closed, if we have opening hours.
  const hours = place.regularOpeningHours
  if (hours?.periods) {
    const openHours = new Set()
    for (const period of hours.periods) {
      if (period.open?.hour !== undefined) {
        // Mark the open window as potentially active.
        const start = period.open.hour
        const end = period.close?.hour ?? 23
        for (let h = start; h < end; h++) openHours.add(h)
      }
    }
    if (openHours.size > 0) {
      for (let h = 0; h < 24; h++) {
        if (!openHours.has(h)) scaled[h] = 0
      }
    }
  }

  return scaled
}

// ─── API calls ────────────────────────────────────────────────────────

/** Return the API key or null. */
function apiKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || null
}

/**
 * Fetch places from Google Places Text Search (New) API.
 * Returns an array of Giftour-shaped activity objects, or null on failure.
 */
export async function fetchPlaces(destination) {
  const key = apiKey()
  if (!key) return null

  const query = `things to do in ${destination}`
  const body = {
    textQuery: query,
    maxResultCount: 15,
    languageCode: 'en',
  }

  try {
    const res = await fetch(`${BASE}/places:searchText`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELDS,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.warn(`giftour: Google Places API error ${res.status}`, await res.text().catch(() => ''))
      return null
    }
    const data = await res.json()
    if (!data.places || !data.places.length) return []

    // Map each place to Giftour activity shape.
    return data.places.map(p => toActivityShape(p)).filter(Boolean)
  } catch (err) {
    console.warn('giftour: Google Places API call failed', err)
    return null
  }
}

/**
 * Fetch details for a single place by its Google place ID.
 * Returns a Giftour-shaped activity object or null.
 */
export async function fetchPlaceDetails(placeId) {
  const key = apiKey()
  if (!key) return null

  try {
    const res = await fetch(`${BASE}/places/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELDS.replace(/^places\./gm, ''),
      },
    })
    if (!res.ok) return null
    const data = await res.json()
    return toActivityShape(data)
  } catch (err) {
    console.warn('giftour: Google Place Details call failed', err)
    return null
  }
}

// ─── Shape mapping ────────────────────────────────────────────────────

/**
 * Convert a Google Places API response object into a Giftour activity.
 */
export function toActivityShape(place) {
  if (!place || !place.id) return null

  const category = mapCategory(place.types)
  const sensory = inferSensory(place, category)
  const crowdByHour = inferCrowdCurve(place, category)

  // Build a short location string from the address.
  const address = place.formattedAddress || ''
  const location = shortenAddress(address)

  // Description: prefer editorialSummary, fall back to generativeSummary, then a short blurb.
  const description = place.editorialSummary?.text
    || `${place.displayName?.text || 'Unknown'} — a ${category} spot${address ? ` near ${location}` : ''}.`

  return {
    id: `gmaps-${place.id}`,
    name: place.displayName?.text || 'Unknown Place',
    category,
    location,
    sensory,
    description,
    crowdByHour,
    // Extra metadata for the LLM to use in scoring.
    rating: place.rating || 0,
    userRatingCount: place.userRatingCount || 0,
    priceLevel: place.priceLevel ?? 1,
    website: place.websiteUri || null,
    // Mark as API-derived so the LLM can prefer it.
    _source: 'google',
  }
}

/** Extract a short area label from a full address. */
function shortenAddress(address) {
  if (!address) return 'Unknown'
  // Try to get a neighborhood / area from the address.
  const parts = address.split(',').map(s => s.trim())
  // Usually "Street, City, Country" — take first meaningful part.
  if (parts.length >= 2) return parts.slice(0, 2).join(', ')
  return parts[0]
}
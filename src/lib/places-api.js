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

// Fields for Text Search — photos are NOT returned here, so we get basics.
const SEARCH_FIELDS = [
  'places.displayName',
  'places.formattedAddress',
  'places.types',
  'places.primaryType',
  'places.id',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
].join(',')

// Fields for Place Details — this IS where photos.name is available.
const DETAILS_FIELDS = [
  'editorialSummary',
  'generativeSummary',
].join(',')

// ─── Category mapping ─────────────────────────────────────────────────

const PRIMARY_CATEGORY_MAP = {
  museum: 'culture',
  art_gallery: 'culture',
  historical_landmark: 'culture',
  historical_place: 'culture',
  church: 'culture',
  cathedral: 'culture',
  mosque: 'culture',
  temple: 'culture',
  hindu_temple: 'culture',
  synagogue: 'culture',
  place_of_worship: 'culture',
  monument: 'culture',
  castle: 'culture',
  park: 'outdoors',
  garden: 'outdoors',
  natural_feature: 'outdoors',
  national_park: 'outdoors',
  state_park: 'outdoors',
  beach: 'outdoors',
  zoo: 'outdoors',
  aquarium: 'outdoors',
  botanical_garden: 'outdoors',
  hiking_area: 'outdoors',
  campground: 'outdoors',
  marina: 'outdoors',
  restaurant: 'food',
  cafe: 'food',
  bakery: 'food',
  bar: 'food',
  pub: 'food',
  fast_food: 'food',
  food: 'food',
  library: 'rest',
  spa: 'rest',
  wellness_center: 'rest',
  yoga_studio: 'rest',
  night_club: 'event',
  casino: 'event',
  movie_theater: 'event',
  stadium: 'event',
  performing_arts_theater: 'event',
  concert_hall: 'event',
  event_venue: 'event',
  convention_center: 'event',
  amusement_park: 'event',
  bowling_alley: 'event',
}

const FALLBACK_CATEGORY_MAP = [
  { types: ['park', 'garden', 'natural_feature', 'national_park', 'state_park', 'beach', 'zoo', 'aquarium', 'botanical_garden', 'hiking_area', 'campground', 'marina', 'dog_park', 'playground', 'rv_park'], category: 'outdoors' },
  { types: ['museum', 'art_gallery', 'historical_landmark', 'historical_place', 'church', 'cathedral', 'mosque', 'temple', 'hindu_temple', 'synagogue', 'place_of_worship', 'monument', 'castle', 'city_hall', 'embassy', 'government_office'], category: 'culture' },
  { types: ['restaurant', 'cafe', 'bakery', 'bar', 'pub', 'meal_takeaway', 'meal_delivery', 'fast_food', 'food', 'grocery_store', 'supermarket', 'convenience_store', 'liquor_store', 'butcher'], category: 'food' },
  { types: ['library', 'spa', 'wellness_center', 'beauty_salon', 'hair_care', 'gym', 'health', 'doctor', 'dentist', 'pharmacy', 'hospital', 'physiotherapist', 'yoga_studio', 'massage'], category: 'rest' },
  { types: ['night_club', 'casino', 'movie_theater', 'movie_rental', 'stadium', 'sports_club', 'sports_complex', 'bowling_alley', 'amusement_center', 'amusement_park', 'performing_arts_theater', 'concert_hall', 'event_venue', 'convention_center'], category: 'event' },
  { types: ['tourist_attraction', 'point_of_interest', 'establishment'], category: 'culture' },
]

function mapCategory(primaryType, types) {
  if (primaryType && PRIMARY_CATEGORY_MAP[primaryType]) {
    return PRIMARY_CATEGORY_MAP[primaryType]
  }
  if (types && types.length) {
    for (const entry of FALLBACK_CATEGORY_MAP) {
      for (const t of types) {
        if (entry.types.includes(t)) return entry.category
      }
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
  const rating = place.rating || 0
  const price = place.priceLevel ?? 1
  if (rating >= 4.5) base.crowds = Math.min(5, base.crowds + 0.5)
  if (price <= 1) base.crowds = Math.min(5, base.crowds + 0.5)
  if (price >= 3) base.noise = Math.min(5, base.noise + 0.5)
  if (place.outdoorSeating) { base.noise = Math.max(0, base.noise - 0.5); base.light = Math.max(0, base.light - 0.5) }
  if (place.liveMusic) base.noise = Math.min(5, base.noise + 1.5)
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
  const rating = place.rating || 0
  const price = place.priceLevel ?? 1
  const scale = 1 + (rating - 3) * 0.15 + (price <= 1 ? 0.2 : 0) + (price >= 3 ? -0.15 : 0)
  const scaled = template.map(v => Math.min(5, Math.max(0, Math.round(v * scale))))
  const hours = place.regularOpeningHours
  if (hours?.periods) {
    const openHours = new Set()
    for (const period of hours.periods) {
      if (period.open?.hour !== undefined) {
        const start = period.open.hour
        const end = period.close?.hour ?? 23
        for (let h = start; h < end; h++) openHours.add(h)
      }
    }
    if (openHours.size > 0) {
      for (let h = 0; h < 24; h++) { if (!openHours.has(h)) scaled[h] = 0 }
    }
  }
  return scaled
}

// ─── API calls ────────────────────────────────────────────────────────

function apiKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || null
}

async function searchText(query, key) {
  const res = await fetch(`${BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': SEARCH_FIELDS,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 10, languageCode: 'en' }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.places || []
}

/**
 * Fetch a single place's details to get photos and descriptions.
 * Returns enriched data or null.
 */
async function fetchDetails(placeId, key) {
  try {
    const res = await fetch(`${BASE}/places/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': DETAILS_FIELDS,
      },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Fetch a photo from Wikimedia Commons for a given place name.
 * Returns the image URL or null.
 */
async function fetchWikimediaImage(placeName) {
  if (!placeName) return null
  const title = encodeURIComponent(placeName)
  const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${title}&prop=pageimages&format=json&pithumbsize=500&origin=*`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const pages = data?.query?.pages || {}
    for (const page of Object.values(pages)) {
      if (page.thumbnail?.source) {
        // Strip tracking query params from the Wikimedia URL.
        return page.thumbnail.source.split('?')[0]
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Fetch images from Wikimedia Commons for multiple place names in parallel.
 * Returns a map of name-lowercase → image URL.
 */
async function fetchWikimediaImages(placeNames) {
  const entries = placeNames.filter(Boolean).slice(0, 10)
  const results = await Promise.allSettled(entries.map(n => fetchWikimediaImage(n)))
  const map = {}
  for (let i = 0; i < entries.length; i++) {
    const key = entries[i].toLowerCase().trim()
    if (results[i].status === 'fulfilled' && results[i].value) {
      map[key] = results[i].value
    }
  }
  return map
}

/**
 * Fetch places from Google Places Text Search + Place Details.
 * Returns an array of Giftour-shaped activity objects, or null on failure.
 */
export async function fetchPlaces(destination) {
  const key = apiKey()
  if (!key) return null

  try {
    // Run two targeted searches in parallel for better coverage.
    const [landmarkResults, attractionResults] = await Promise.all([
      searchText(`famous landmarks in ${destination}`, key),
      searchText(`top tourist attractions in ${destination}`, key),
    ])

    // Merge: deduplicate by place ID.
    const seen = new Set()
    const merged = []
    for (const list of [landmarkResults || [], attractionResults || []]) {
      for (const p of list) {
        if (!seen.has(p.id) && p.id) {
          seen.add(p.id)
          merged.push(p)
        }
      }
    }

    if (merged.length === 0) return null

    // Fetch Place Details for the top results to get descriptions.
    // Limit to 8 so we don't hammer the API or exceed quota.
    const topIds = merged.slice(0, 8).map(p => p.id)
    const details = await Promise.all(topIds.map(id => fetchDetails(id, key)))

    // Merge details back into the search results.
    const detailsMap = {}
    for (const d of details) {
      if (d && d.id) detailsMap[d.id] = d
    }

    const enriched = merged.map(p => {
      const detail = detailsMap[p.id]
      return detail ? { ...p, ...detail } : p
    })

    // Fetch real images from Wikimedia Commons for the top places.
    const placeNames = enriched.map(p => p.displayName?.text).filter(Boolean)
    const wikiImages = await fetchWikimediaImages(placeNames)

    return enriched.map(p => toActivityShape(p, wikiImages)).filter(Boolean)
  } catch (err) {
    console.warn('giftour: Google Places API call failed', err)
    return null
  }
}

// ─── Shape mapping ────────────────────────────────────────────────────

export function toActivityShape(place, wikiImages) {
  if (!place || !place.id) return null

  const category = mapCategory(place.primaryType, place.types)
  const sensory = inferSensory(place, category)
  const crowdByHour = inferCrowdCurve(place, category)
  const address = place.formattedAddress || ''
  const location = shortenAddress(address)
  const description = buildDescription(place, category)
  const photoUrl = buildPhotoUrl(place, wikiImages)

  return {
    id: `gmaps-${place.id}`,
    name: place.displayName?.text || 'Unknown Place',
    category,
    location,
    sensory,
    description,
    crowdByHour,
    photoUrl,
    rating: place.rating || 0,
    userRatingCount: place.userRatingCount || 0,
    priceLevel: place.priceLevel ?? 1,
    website: place.websiteUri || null,
    _source: 'google',
  }
}

function buildDescription(place, category) {
  if (place.generativeSummary?.overview?.text) return place.generativeSummary.overview.text
  if (place.editorialSummary?.text) return place.editorialSummary.text
  const name = place.displayName?.text || 'This spot'
  const rating = place.rating ? `${place.rating}/5 stars` : ''
  const reviews = place.userRatingCount ? `(${place.userRatingCount} reviews)` : ''
  const price = place.priceLevel != null ? '· ' + '$'.repeat(place.priceLevel) : ''
  return `${name} — a ${category} attraction${rating ? ` rated ${rating} ${reviews} ${price}` : ''}.`
}

/** Build a photo URL: try Wikimedia, fall back to a placeholder. */
function buildPhotoUrl(place, wikiImages) {
  const name = place.displayName?.text || ''
  if (wikiImages && name) {
    const key = name.toLowerCase().trim()
    if (wikiImages[key]) return wikiImages[key]
  }
  // No photo available — return null so the card hides the photo section.
  return null
}

function shortenAddress(address) {
  if (!address) return 'Unknown'
  const parts = address.split(',').map(s => s.trim())
  if (parts.length >= 2) return parts.slice(0, 2).join(', ')
  return parts[0]
}
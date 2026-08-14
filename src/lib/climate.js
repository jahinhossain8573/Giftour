// Simple climate data for curated cities. Used to bias recommendations toward
// indoor or outdoor activities based on the time of year.
//
// Values are average monthly high temperatures in °C.
// Source: typical climate averages for each city.

const CITY_CLIMATES = {
  london:    [8, 8, 11, 14, 18, 21, 23, 23, 20, 15, 11, 8],
  tokyo:     [10, 11, 14, 19, 23, 26, 30, 31, 27, 22, 17, 12],
  kyoto:     [9, 10, 14, 20, 25, 28, 32, 33, 29, 23, 17, 11],
  newyork:   [4, 6, 11, 17, 22, 27, 30, 29, 25, 18, 12, 6],
  paris:     [7, 8, 12, 16, 20, 23, 26, 26, 22, 16, 11, 8],
  dhaka:     [25, 28, 32, 33, 33, 32, 31, 31, 31, 31, 29, 26],
  chattogram:[25, 28, 31, 32, 33, 32, 31, 31, 31, 30, 29, 26],
  coxsbazar: [25, 27, 30, 31, 32, 31, 30, 30, 30, 30, 28, 26],
  toronto:   [-1, -1, 3, 10, 18, 23, 27, 26, 22, 14, 8, 2],
  losangeles:[20, 20, 21, 22, 23, 25, 28, 29, 28, 26, 23, 20],
  florida:   [23, 24, 26, 28, 30, 32, 33, 33, 31, 29, 26, 24],
  sydney:    [26, 26, 25, 22, 19, 17, 16, 18, 20, 22, 24, 25],
  melbourne: [26, 26, 24, 20, 17, 14, 14, 15, 17, 20, 22, 24],
  brisbane:  [29, 29, 28, 26, 23, 21, 21, 22, 24, 26, 28, 29],
  perth:     [31, 31, 29, 25, 21, 19, 18, 19, 20, 22, 26, 29],
}

/** Thresholds for categorising monthly average highs. */
const HOT_THRESHOLD = 28
const COLD_THRESHOLD = 10

/**
 * Determine the climate category for a destination during the current month.
 * Matches using the same alias system as places.js.
 *
 * @param {string} destination  Free-form destination string (e.g. "London" or "central london")
 * @param {number} [month]      Month index 0-11 (defaults to current month)
 * @returns {'hot' | 'cold' | 'mild'}
 */
export function climateCategory(destination, month) {
  if (!destination) return 'mild'
  month = month ?? new Date().getMonth()

  const cityId = matchCityId(destination)
  if (!cityId) return 'mild'

  const temps = CITY_CLIMATES[cityId]
  if (!temps) return 'mild'

  const avg = temps[Math.min(11, Math.max(0, month))]
  if (avg >= HOT_THRESHOLD) return 'hot'
  if (avg <= COLD_THRESHOLD) return 'cold'
  return 'mild'
}

/**
 * Get the average high temperature for a destination this month.
 * Returns null for unknown destinations.
 */
export function averageHigh(destination, month) {
  if (!destination) return null
  month = month ?? new Date().getMonth()
  const cityId = matchCityId(destination)
  if (!cityId) return null
  const temps = CITY_CLIMATES[cityId]
  return temps ? temps[Math.min(11, Math.max(0, month))] : null
}

// City alias list matching places.js conventions.
const CITY_ALIASES = [
  { id: 'london',    aliases: ['london', 'greater london', 'central london', 'westminster', 'city of london'] },
  { id: 'tokyo',     aliases: ['tokyo', 'shibuya', 'shinjuku', 'asakusa', 'ginza', 'ueno', 'akihabara', 'chiyoda', 'odaiba'] },
  { id: 'kyoto',     aliases: ['kyoto', 'higashiyama', 'arashiyama', 'gion', 'kinkakuji', 'fushimi', 'nishiki', 'kiyomizu'] },
  { id: 'newyork',   aliases: ['new york', 'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx'] },
  { id: 'paris',     aliases: ['paris', 'ile de france', 'ile de france', 'marais', 'montmartre', 'latin quarter'] },
  { id: 'dhaka',     aliases: ['dhaka', 'dacca', 'old dhaka', 'gulshan', 'uttara', 'banani', 'mirpur'] },
  { id: 'chattogram',aliases: ['chattogram', 'chittagong', 'chattagram', 'port city', 'ctg'] },
  { id: 'coxsbazar', aliases: ["cox's bazar", 'coxs bazar', 'cox bazar', 'panowa'] },
  { id: 'toronto',   aliases: ['toronto', 'downtown toronto', 'york', 'scarborough', 'etobicoke', 'north york'] },
  { id: 'losangeles',aliases: ['los angeles', 'la', 'hollywood', 'santa monica', 'venice', 'beverly hills', 'downtown la'] },
  { id: 'florida',   aliases: ['florida', 'orlando', 'miami', 'tampa', 'jacksonville', 'cape canaveral', 'key west', 'fort lauderdale'] },
  { id: 'sydney',    aliases: ['sydney', 'greater sydney', 'darling harbour', 'circular quay', 'bondi', 'surry hills'] },
  { id: 'melbourne', aliases: ['melbourne', 'greater melbourne', 'southbank', 'fitzroy', 'st kilda', 'collingwood', 'carlton'] },
  { id: 'brisbane',  aliases: ['brisbane', 'greater brisbane', 'south bank', 'fortitude valley', 'new farm', 'west end'] },
  { id: 'perth',     aliases: ['perth', 'greater perth', 'fremantle', 'cottesloe', 'scarborough', 'kings park'] },
]

function matchCityId(destination) {
  const q = destination.toLowerCase().trim()
  if (!q) return null
  const candidates = []
  for (const city of CITY_ALIASES) {
    for (const alias of city.aliases) {
      candidates.push({ cityId: city.id, alias })
    }
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length)
  for (const { cityId, alias } of candidates) {
    if (q.includes(alias)) return cityId
  }
  return null
}
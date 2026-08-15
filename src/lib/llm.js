// Mock LLM client. Designed to be swapped for a real provider by replacing
// this single function. Real implementation would send:
//   - system prompt (assistant role + safety + sensory-aware rules)
//   - user context (profile, history, today's raw items)
//   - expect a JSON itinerary back
// For the MVP, we run deterministic rules that mirror the prompt's intent.

import { ACTIVITIES, getActivityById, VISIT_HOURS, estimateHours } from '../data/activities.js'
import { activityLoad, isRest, dayLoad, capForProfile } from './sensory.js'
import { suitability, crowdAt } from './crowd.js'
import { climateCategory } from './climate.js'

// Recompute visit type from actual estimated hours so grouping matches reality.
function typeFromHours(hours) {
  if (hours > 4) return 'intense'
  if (hours >= 2) return 'moderate'
  return 'light'
}

const SYSTEM_PROMPT = `You are an itinerary assistant for autistic travellers. You must:
1. Order items to minimise sensory fatigue: heaviest items mid-morning, never back-to-back.
2. Insert a low-stimulus rest after every 2 high-stimulus items.
3. Prefer each activity's quietest hour based on crowd data.
4. Reject items that exceed the user's per-axis tolerance unless explicitly opted in.
5. Keep total daily sensory load under the user's cap.
6. Output strict JSON: [{id, activityId, startHour, hours, reasoning}].`

export const SYSTEM_PROMPT_PUBLIC = SYSTEM_PROMPT

// ─── Helpers ──────────────────────────────────────────────────────────

/** Return the first N items of the ranked pool that fit the cap. */
function pickBestN({ pool, profile, preferences, modifiers, cap, maxItems, mustIncludeIds, climate }) {
  const wantIndoors = modifiers.includes('indoors')
  const wantOutdoors = modifiers.includes('outdoors')
  const wantQuieter = modifiers.includes('quieter')
  const wantFood = modifiers.includes('add-food')
  const restEvery = profile?.rest === 'open'
    ? 999
    : (modifiers.includes('more-rest') ? 1 : 2)
  const tolerance = profile?.tolerance ?? 3

  const isLandmark = (a) => {
    // Landmark IDs follow the pattern "city-slug", e.g. london-british-museum.
    // Google-sourced places start with "gmaps-".
    // Generic activities (museum-quiet, park-riverside, …) don't match either.
    return /^(?:[a-z]+-[a-z]+-|gmaps-)/.test(a.id)
  }
  const isGeneric = (a) => !isLandmark(a) && !a._source

  // Check if the pool has ANY real places. If so, generic calm activities get
  // a heavy penalty — they're fallbacks, not the main attraction.
  const hasRealPlaces = pool.some(a => isLandmark(a))
  const genericPenalty = hasRealPlaces ? 60 : 0

  // Climate bonus: hot/cold → prefer indoor, mild → prefer outdoor
  const climateIndoorBonus = (climate === 'hot' || climate === 'cold') ? 20 : 0
  const climateOutdoorBonus = climate === 'mild' ? 15 : (climate === 'hot' || climate === 'cold' ? -10 : 0)

  // Score and rank.
  const ranked = pool
    .filter(a => !wantIndoors || isIndoor(a))
    .filter(a => !wantOutdoors || isOutdoor(a))
    .map(a => ({
      activity: a,
      score: suitability(a, profile),
      penalty: preferences.disliked?.includes(a.category) ? 30 : 0,
      landmarkBonus: isLandmark(a) ? tolerance * 8 : 0,
      genericPenalty: isGeneric(a) ? genericPenalty : 0,
      climateBonus: isIndoor(a) ? climateIndoorBonus : (isOutdoor(a) ? climateOutdoorBonus : 0),
      bonus: wantQuieter && activityLoad(a) <= 3 ? 25 : (wantQuieter ? -15 : 0),
    }))
    .map(x => ({ ...x, total: x.score - x.penalty - x.genericPenalty + x.landmarkBonus + x.climateBonus + x.bonus }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total)

  // Force-include must-haves.
  const mustInclude = []
  if (wantFood) {
    const food = ranked.find(r => r.activity.category === 'food' && activityLoad(r.activity) < cap)
    if (food) mustInclude.push(food)
  }
  if (mustIncludeIds && mustIncludeIds.length > 0) {
    for (const id of mustIncludeIds) {
      const found = ranked.find(r => r.activity.id === id)
      if (found && !mustInclude.find(m => m.activity.id === id)) mustInclude.push(found)
    }
  }

  // Build a day.
  const picked = []
  let load = 0
  let sinceRest = 0
  const categories = new Set()
  const usedIds = new Set()

  for (const cand of [...mustInclude, ...ranked]) {
    if (usedIds.has(cand.activity.id)) continue
    if (picked.length >= maxItems) break
    if (picked.length >= 1 && categories.size >= 3 && !categories.has(cand.activity.category)) continue

    const isHeavy = activityLoad(cand.activity) >= 8
    if (isHeavy && sinceRest >= restEvery && !picked.some(i => isRest(i.activity))) {
      const rest = ranked.find(r => isRest(r.activity) && !usedIds.has(r.activity.id))
      if (rest) {
        usedIds.add(rest.activity.id)
        picked.push({ activityId: rest.activity.id, hours: visitHours(rest.activity) })
        categories.add(rest.activity.category)
        sinceRest = 0
        load = dayLoad(picked)
      }
    }
    const projected = load + activityLoad(cand.activity)
    if (projected > cap) continue
    usedIds.add(cand.activity.id)
    picked.push({ activityId: cand.activity.id, hours: visitHours(cand.activity) })
    categories.add(cand.activity.category)
    sinceRest += 1
    load = dayLoad(picked)
  }

  if (picked.length === 0) {
    const calm = [...pool].sort((a, b) => activityLoad(a) - activityLoad(b))[0]
    picked.push({ activityId: calm.id, hours: 1 })
  }

  return picked
}

/** Simple instruction parser. Returns {add, remove, swapOut, swapIn, constraints}. */
function parseInstruction(instruction) {
  const lower = (instruction || '').toLowerCase()
  const result = { remove: [], add: [], swapOut: null, swapIn: null, constraints: [] }

  // Detect removal intents.
  const removePatterns = [
    /remove\s+(.+)/i, /drop\s+(.+)/i, /delete\s+(.+)/i, /skip\s+(.+)/i,
    /no\s+(.+)/i, /not\s+(.+)/i, /avoid\s+(.+)/i, /get\s+rid\s+of\s+(.+)/i,
  ]
  for (const pat of removePatterns) {
    const m = lower.match(pat)
    if (m) result.remove.push(m[1].trim())
  }

  // Detect add intents.
  const addPatterns = [
    /add\s+(.+)/i, /include\s+(.+)/i, /put\s+in\s+(.+)/i,
    /insert\s+(.+)/i,
  ]
  for (const pat of addPatterns) {
    const m = lower.match(pat)
    if (m) result.add.push(m[1].trim())
  }

  // Detect swap intents.
  const swapPatterns = [
    /swap\s+(.+?)\s+(?:for|with)\s+(.+)/i,
    /replace\s+(.+?)\s+(?:with|by)\s+(.+)/i,
    /change\s+(.+?)\s+(?:to|for)\s+(.+)/i,
  ]
  for (const pat of swapPatterns) {
    const m = lower.match(pat)
    if (m) { result.swapOut = m[1].trim(); result.swapIn = m[2].trim() }
  }

  // Detect constraint intents.
  if (/quieter|less noise|too loud|quiet/i.test(lower) && !result.remove.length) result.constraints.push('quieter')
  if (/shorter|less time|fewer/i.test(lower)) result.constraints.push('shorter')
  if (/outdoors?|outside|park|nature|trail/i.test(lower)) result.constraints.push('outdoors')
  if (/indoors?|inside|museum|gallery|indoor/i.test(lower)) result.constraints.push('indoors')
  if (/food|eat|lunch|dinner|cafe|restaurant|snack/i.test(lower)) result.constraints.push('food')
  if (/rest|break|pause|recovery|calm/i.test(lower)) result.constraints.push('more-rest')

  return result
}

/** Fuzzy-match a string against the pool of activities. Returns the best match or null. */
function fuzzyMatch(query, pool) {
  const q = query.toLowerCase().trim()
  // Exact match first.
  const exact = pool.find(a => a.name.toLowerCase() === q || a.id.toLowerCase() === q)
  if (exact) return exact
  // Substring match — prefer longer name matches.
  const candidates = pool
    .map(a => ({ activity: a, score: scoreMatch(q, a) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
  return candidates[0]?.activity || null
}

function scoreMatch(query, activity) {
  const name = activity.name.toLowerCase()
  const category = activity.category.toLowerCase()
  const location = activity.location.toLowerCase()
  let score = 0
  if (name === query) score += 100
  else if (name.includes(query)) score += 60
  else if (query.includes(name)) score += 40
  if (category.includes(query) || query.includes(category)) score += 25
  if (location.includes(query)) score += 15
  // Individual keywords.
  const keywords = query.split(/\s+/)
  for (const kw of keywords) {
    if (kw.length < 3) continue
    if (name.includes(kw)) score += 10
  }
  return score
}

// ─── Main functions ───────────────────────────────────────────────────

// ORGANISE: take what the user added and reorder/schedule it.
// NOW ALSO respects the instruction: adds, removes, swaps activities.
export async function organiseItinerary({ date, items, profile, places, trip, modifiers = [], instruction = '' }) {
  const pool = places || ACTIVITIES
  await delay(350)
  const cap = capForProfile(profile)
  const climate = climateCategory(trip?.destination)

  // Parse the instruction.
  const parsed = parseInstruction(instruction)

  // 1. Handle removals.
  let working = [...items]
  for (const removeWhat of parsed.remove) {
    const match = fuzzyMatch(removeWhat, pool)
    if (match) {
      working = working.filter(it => it.activityId !== match.id)
    }
  }

  // 2. Handle swaps.
  if (parsed.swapOut && parsed.swapIn) {
    const outMatch = fuzzyMatch(parsed.swapOut, pool)
    const inMatch = fuzzyMatch(parsed.swapIn, pool)
    if (outMatch && inMatch) {
      const idx = working.findIndex(it => it.activityId === outMatch.id)
      if (idx !== -1) {
        working[idx] = {
          ...working[idx],
          activityId: inMatch.id,
        }
      }
    }
  }

  // 3. Handle adds.
  if (parsed.add.length > 0) {
    for (const addWhat of parsed.add) {
      const match = fuzzyMatch(addWhat, pool)
      if (match && !working.find(it => it.activityId === match.id)) {
        working.push({
          id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          activityId: match.id,
          startHour: 9,
          hours: 1,
          notes: '',
          completed: false,
          comfort: 0,
        })
      }
    }
  }

  // 4. If constraints were detected but no specific item was named,
  //    regenerate with those constraints applied as modifiers.
  //    ALSO: if instruction is non-empty but NO patterns matched at all,
  //    treat it as a constraint-based regeneration so "I want quieter"
  //    or "fewer crowds" still does something.
  const nothingMatched = parsed.remove.length === 0 && parsed.add.length === 0 && !parsed.swapOut && parsed.constraints.length === 0
  if (nothingMatched && instruction.trim()) {
    // Infer modifier from the raw instruction text.
    const lower = instruction.toLowerCase()
    const inferred = []
    if (/quiet|noise|loud|calm/i.test(lower)) inferred.push('quieter')
    if (/outdoor|park|nature|outside/i.test(lower)) inferred.push('outdoors')
    if (/indoor|inside|museum|gallery/i.test(lower)) inferred.push('indoors')
    if (/food|eat|cafe|restaurant|lunch|dinner/i.test(lower)) inferred.push('add-food')
    if (/rest|break|pause/i.test(lower)) inferred.push('more-rest')
    if (/short|fewer|less/i.test(lower)) inferred.push('shorter')
    if (/early|earlier/i.test(lower)) inferred.push('earlier')
    if (/late|later/i.test(lower)) inferred.push('later')

    // Also try fuzzy-matching the full instruction against the pool to
    // see if the user named a specific place to add or remove.
    const matchedPlace = fuzzyMatch(instruction, pool)
    if (matchedPlace && working.some(it => it.activityId === matchedPlace.id)) {
      // They named something already in the plan → remove it.
      working = working.filter(it => it.activityId !== matchedPlace.id)
    } else if (matchedPlace) {
      // They named something NOT in the plan → add it.
      working.push({
        id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        activityId: matchedPlace.id,
        startHour: 9,
        hours: 1,
        notes: '',
        completed: false,
        comfort: 0,
      })
    }

    if (inferred.length > 0 || matchedPlace) {
      const mergedModifiers = [...new Set([...modifiers, ...inferred])]
      const freshPicked = pickBestN({
        pool, profile, preferences: { disliked: [] }, modifiers: mergedModifiers,
        cap, maxItems: computeMaxItems(mergedModifiers, profile), climate,
      })
      if (freshPicked.length > 0) {
        working = freshPicked.map(a => ({
          id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          activityId: a.activityId,
          startHour: 9,
          hours: a.hours || 1,
          notes: '',
          completed: false,
          comfort: 0,
        }))
      }
    }
  } else if (parsed.constraints.length > 0 && parsed.remove.length === 0 && parsed.add.length === 0 && !parsed.swapOut) {
    const mergedModifiers = [...new Set([...modifiers, ...parsed.constraints])]
    const freshPicked = pickBestN({
      pool, profile, preferences: { disliked: [] }, modifiers: mergedModifiers,
      cap, maxItems: computeMaxItems(mergedModifiers, profile),
    })
    if (freshPicked.length > 0) {
      working = freshPicked.map(a => ({
        id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        activityId: a.activityId,
        startHour: 9,
        hours: a.hours || 1,
        notes: '',
        completed: false,
        comfort: 0,
      }))
    }
  }

  // 5. Re-schedule: order items with rest interleaved, spreading across the day.
  const decorated = working
    .filter(i => getActivityById(i.activityId, pool))
    .map(i => ({ ...i, activity: getActivityById(i.activityId, pool) }))

  const rests = decorated.filter(i => isRest(i.activity))
  const others = decorated.filter(i => !isRest(i.activity))
  others.sort((a, b) => activityLoad(a.activity) - activityLoad(b.activity))

  const startHour = computeStartHour(profile, modifiers)
  const endHour = trip?.duration === 'full' ? DAY_END_FULL : trip?.duration === 'half' ? 14 : trip?.duration === 'short' ? 12 : DAY_END_FULL
  const totalHours = endHour - startHour
  const slotCount = others.length
  const hoursPerSlot = Math.min(2, slotCount > 0 ? Math.max(1, Math.floor(totalHours / (slotCount + (rests.length > 0 ? 1 : 0)))) : 2)

  const ordered = []
  const restEvery = profile?.rest === 'open'
    ? 999
    : (modifiers.includes('more-rest') ? 1 : 2)
  let cursor = startHour
  let sinceRest = 0
  for (const item of others) {
    if (sinceRest >= restEvery && rests.length) {
      const rest = rests.shift()
      ordered.push(schedule(rest, cursor, 1, 'recovery break'))
      cursor += 1
      sinceRest = 0
    }
    const hours = Math.min(hoursPerSlot, endHour - cursor)
    if (hours < 1) break
    let bestHour = cursor
    let bestCrowd = crowdAt(item.activity, cursor)
    for (let h = Math.max(8, cursor - 1); h <= Math.min(endHour, cursor + 2); h++) {
      if (crowdAt(item.activity, h) < bestCrowd) { bestHour = h; bestCrowd = crowdAt(item.activity, h) }
    }
    if (bestHour < cursor) cursor = bestHour
    ordered.push(schedule(item, cursor, hours, reasoningFor(item.activity, profile, cursor)))
    cursor += hours
    sinceRest += 1
  }
  for (const rest of rests) {
    if (cursor >= endHour) break
    ordered.push(schedule(rest, Math.min(cursor, endHour - 1), rest.hours || 1, 'wind-down break'))
    cursor += (rest.hours || 1)
  }

  // If we've blown the cap, drop the heaviest items and warn.
  let load = dayLoad(ordered)
  while (load > cap && ordered.length > 1) {
    const heaviest = ordered
      .map((it, idx) => ({ it, idx, l: activityLoad(it.activity, it.hours) }))
      .sort((a, b) => b.l - a.l)[0]
    if (!heaviest || heaviest.l <= 0) break
    ordered.splice(heaviest.idx, 1)
    load = dayLoad(ordered)
  }

  const climateNote = climate === 'hot'
    ? ' Hot weather — favouring indoor activities.'
    : climate === 'cold'
      ? ' Cold weather — favouring indoor activities.'
      : climate === 'mild'
        ? ' Mild weather — outdoor-friendly.'
        : ''

  return {
    items: fillDayGaps(ordered, startHour, endHour, profile),
    notes: (load > cap * 0.8
      ? `Loaded day (${load}/${cap}). Consider removing one item or adding a longer rest.`
      : `Comfortable load (${load}/${cap}).`) + climateNote,
  }
}

// GENERATE: no user input — pick activities from the catalogue that fit the profile.
export async function generateItinerary({ date, profile, preferences = {}, places, trip, modifiers = [], instruction = '' }) {
  await delay(500)
  const pool = places || ACTIVITIES
  const cap = capForProfile(profile)
  const climate = climateCategory(trip?.destination)

  const startHour = computeStartHour(profile, modifiers)
  const maxItems = computeMaxItems(modifiers, profile)

  const picked = pickBestN({
    pool, profile, preferences, modifiers, cap, maxItems, climate,
  })

  // Schedule the picked items, spreading them across the available time.
  const rests = picked.filter(a => {
    const act = getActivityById(a.activityId, pool)
    return act && isRest(act)
  })
  const others = picked.filter(a => {
    const act = getActivityById(a.activityId, pool)
    return !act || !isRest(act)
  })

  // Determine the end hour based on trip duration.
  const endHour = trip?.duration === 'full' ? DAY_END_FULL : trip?.duration === 'half' ? 14 : trip?.duration === 'short' ? 12 : DAY_END_FULL
  const totalHours = endHour - startHour
  const slotCount = others.length
  const hoursPerSlot = Math.min(2, slotCount > 0 ? Math.max(1, Math.floor(totalHours / (slotCount + (rests.length > 0 ? 1 : 0)))) : 2)

  const ordered = []
  const restEvery = profile?.rest === 'open'
    ? 999
    : (modifiers.includes('more-rest') ? 1 : 2)
  let cursor = startHour
  let sinceRest = 0
  for (const item of others) {
    if (sinceRest >= restEvery && rests.length) {
      const rest = rests.shift()
      const act = getActivityById(rest.activityId, pool)
      ordered.push(schedule(rest, cursor, 1, act ? reasoningFor(act, profile, cursor) : 'recovery break'))
      cursor += 1
      sinceRest = 0
    }
    const act = getActivityById(item.activityId, pool)
    const hours = Math.min(hoursPerSlot, endHour - cursor)
    if (hours < 1) break
    let bestHour = cursor
    if (act) {
      let bestCrowd = crowdAt(act, cursor)
      for (let h = Math.max(8, cursor - 1); h <= Math.min(endHour, cursor + 2); h++) {
        if (crowdAt(act, h) < bestCrowd) { bestHour = h; bestCrowd = crowdAt(act, h) }
      }
    }
    if (bestHour < cursor) cursor = bestHour
    const reasoning = act ? reasoningFor(act, profile, bestHour) : 'matches your profile'
    ordered.push(schedule(item, cursor, hours, reasoning))
    cursor += hours
    sinceRest += 1
  }
  for (const rest of rests) {
    if (cursor >= endHour) break
    const act = getActivityById(rest.activityId, pool)
    ordered.push(schedule(rest, Math.min(cursor, endHour - 1), 1, act ? reasoningFor(act, profile, Math.min(cursor, endHour - 1)) : 'wind-down'))
    cursor += 1
  }

  // Fill remaining cap with extra landmark items if space allows.
  if (ordered.length < maxItems && pool.some(a => /^(?:[a-z]+-[a-z]+-|gmaps-)/.test(a.id))) {
    const used = new Set(ordered.map(it => it.activityId))
    const extras = [...pool]
      .filter(a => /^(?:[a-z]+-[a-z]+-|gmaps-)/.test(a.id) && !used.has(a.id))
      .map(a => ({ activity: a, score: suitability(a, profile) }))
      .filter(x => x.score > 30)
      .sort((a, b) => b.score - a.score)
    for (const extra of extras) {
      if (ordered.length >= maxItems) break
      const projected = dayLoad(ordered) + activityLoad(extra.activity)
      if (projected > cap) continue
      ordered.push(schedule(
        { activityId: extra.activity.id, hours: 1 },
        cursor,
        1,
        reasoningFor(extra.activity, profile, cursor),
      ))
      cursor += 1
    }
  }

  const tolerance = profile?.tolerance ?? 3
  const toleranceNote = tolerance <= 2
    ? ' Low tolerance — keeping it calm with fewer activities.'
    : tolerance >= 4
      ? ` High tolerance — ${maxItems} activities with more variety.`
      : ''
  const climateNote = climate === 'hot'
    ? ' Hot weather — favouring indoor activities.'
    : climate === 'cold'
      ? ' Cold weather — favouring indoor activities.'
      : climate === 'mild'
        ? ' Mild weather — outdoor-friendly picks.'
        : ''

  return {
    items: fillDayGaps(ordered, startHour, endHour, profile),
    notes: `Auto-generated from your profile. Total load ${dayLoad(ordered)}/${cap}.${toleranceNote}${climateNote}`,
  }
}

// ─── Candidate ranking (used by the new card selector UI) ─────────────

/**
 * Rank ~14 candidate attractions from the pool based on profile fit.
 * Returns an array of { activityId, score } objects, no scheduling.
 */
export async function rankCandidates({ profile, preferences = {}, places, trip, count = 14 }) {
  await delay(300)
  const pool = places || ACTIVITIES
  const isLandmark = (a) => /^(?:[a-z]+-[a-z]+-|gmaps-)/.test(a.id)
  const isGeneric = (a) => !isLandmark(a) && !a._source
  const hasRealPlaces = pool.some(a => isLandmark(a))
  const genericPenalty = hasRealPlaces ? 60 : 0
  const tolerance = profile?.tolerance ?? 3
  const climate = climateCategory(trip?.destination)
  const climateIndoorBonus = (climate === 'hot' || climate === 'cold') ? 20 : 0
  const climateOutdoorBonus = climate === 'mild' ? 15 : (climate === 'hot' || climate === 'cold' ? -10 : 0)

  const ranked = pool
    .filter(a => a.id && a.name)
    .map(a => ({
      activityId: a.id,
      visitType: typeFromHours(estimateHours(a)),
      estimatedHours: estimateHours(a),
      estimatedLoad: activityLoad(a, estimateHours(a)),
      score: suitability(a, profile)
        + (isLandmark(a) ? tolerance * 8 : 0)
        + (isIndoor(a) ? climateIndoorBonus : (isOutdoor(a) ? climateOutdoorBonus : 0))
        - (isGeneric(a) ? genericPenalty : 0)
        - (preferences.disliked?.includes(a.category) ? 25 : 0),
    }))
    .filter(x => x.score > 10)
    .sort((a, b) => b.score - a.score)

  // Ensure diversity of visit types: guarantee at least a few of each.
  const seen = new Set()
  const byType = { intense: [], moderate: [], light: [] }
  for (const item of ranked) {
    const vt = item.visitType || 'moderate'
    if (byType[vt] && byType[vt].length < 4) byType[vt].push(item)
  }
  // Slot in the guaranteed picks (intense first so they don't get cut)
  const finalResult = []
  for (const type of ['intense', 'moderate', 'light']) {
    for (const item of byType[type]) {
      if (!seen.has(item.activityId)) {
        seen.add(item.activityId)
        finalResult.push(item)
      }
    }
  }
  // Fill remaining slots with whatever else scored well
  for (const item of ranked) {
    if (finalResult.length >= count) break
    if (!seen.has(item.activityId)) {
      seen.add(item.activityId)
      finalResult.push(item)
    }
  }

  return finalResult
}

/**
 * Schedule a set of items (from user selections) into time slots.
 * Returns an array of full slot objects with startHour, hours, reasoning.
 */
export function scheduleItems({ items: slotItems, profile, trip, places }) {
  if (!slotItems || !slotItems.length) return []
  const startHour = computeStartHour(profile, [])
  const endHour = trip?.duration === 'full' ? DAY_END_FULL : trip?.duration === 'half' ? 14 : trip?.duration === 'short' ? 12 : DAY_END_FULL
  const totalHours = Math.max(1, endHour - startHour)
  const hoursPerSlot = Math.min(2, Math.max(1, Math.floor(totalHours / slotItems.length)))

  const result = []
  let cursor = startHour
  for (const item of slotItems) {
    const act = getActivityById(item.activityId, places)
    const hours = Math.min(hoursPerSlot, Math.max(1, endHour - cursor))
    if (hours < 1) break
    let bestHour = cursor
    if (act) {
      let bestCrowd = crowdAt(act, cursor)
      for (let h = Math.max(8, cursor - 1); h <= Math.min(endHour, cursor + 2); h++) {
        if (crowdAt(act, h) < bestCrowd) { bestHour = h; bestCrowd = crowdAt(act, h) }
      }
    }
    if (bestHour < cursor) cursor = bestHour
    const reasoning = act ? reasoningFor(act, profile, cursor) : 'matches your profile'
    result.push({
      id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      activityId: item.activityId,
      startHour: cursor,
      hours,
      notes: '',
      completed: false,
      comfort: 0,
      reasoning,
    })
    cursor += hours
  }

  return fillDayGaps(result, startHour, endHour, profile)
}

// ─── Helpers ──────────────────────────────────────────────────────────

const DAY_START = 6
const DAY_END_FULL = 22

function computeStartHour(profile, modifiers) {
  let h = DAY_START
  if (modifiers.includes('earlier')) h = Math.max(5, h - 1)
  if (modifiers.includes('later')) h = Math.min(8, h + 2)
  return h
}

function computeMaxItems(modifiers, profile) {
  const tolerance = profile?.tolerance ?? 3
  let n = Math.min(8, Math.max(2, Math.round(tolerance * 1.2)))
  if (modifiers.includes('shorter')) n = Math.max(1, n - 2)
  return n
}

function isIndoor(a) {
  return ['culture', 'food', 'rest', 'event'].includes(a.category)
}
function isOutdoor(a) {
  return a.category === 'outdoors' || (a.name && /park|trail|garden|river/i.test(a.name))
}

function schedule(item, startHour, hours, reasoning) {
  return {
    id: item.id || `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    activityId: item.activityId,
    startHour,
    hours,
    notes: item.notes || '',
    completed: false,
    comfort: 0,
    reasoning,
  }
}

/** Get the default hours for an activity based on its visitType and Google data. */
function visitHours(activity) {
  return estimateHours(activity)
}

/**
 * Build a complete day structure around the user's selected activities.
 * Inserts morning prep, transit between activities, meals, and evening wind-down
 * so the itinerary covers the full day from start to end hour.
 */
function fillDayGaps(ordered, startHour, endHour, profile) {
  if (!ordered.length) return ordered
  const result = []
  let cursor = startHour
  const needsScheduledBreaks = profile?.rest !== 'open'

  // 1. Morning: wake up, get ready, breakfast
  if (cursor <= 8) {
    const prepEnd = Math.min(cursor + 1, 8)
    result.push(schedule({ activityId: 'getting-ready', hours: prepEnd - cursor }, cursor, prepEnd - cursor, 'wake up and get ready'))
    cursor = prepEnd
    result.push(schedule({ activityId: 'meal-breakfast', hours: 0.5 }, cursor, 0.5, 'breakfast'))
    cursor += 0.5
  }

  // 2. Lay out activities with transit and rest blocks between
  let activitiesSinceRest = 0
  for (let i = 0; i < ordered.length; i++) {
    const slot = ordered[i]
    const actHours = slot.hours || 1

    // Hard cap: don't start anything that would end after endHour (10 PM)
    if (cursor + actHours > endHour) break

    // Insert a rest block after every 2 activities (if scheduled breaks)
    if (needsScheduledBreaks && activitiesSinceRest >= 2 && cursor + 1.5 <= endHour) {
      result.push(schedule({ activityId: 'getting-ready', hours: 0.5 }, cursor, 0.5, 'rest / recovery break'))
      cursor += 0.5
      activitiesSinceRest = 0
    }

    // Short transit (15 min) before each activity
    if (cursor + 0.25 + actHours <= endHour) {
      result.push(schedule({ activityId: 'travel-transit', hours: 0.25 }, cursor, 0.25, 'travel'))
      cursor += 0.25
    }

    // The activity itself
    result.push(schedule(
      { activityId: slot.activityId, hours: actHours },
      cursor, actHours, slot.reasoning || ''
    ))
    cursor += actHours
    activitiesSinceRest++

    // Short recovery after intense activities (4+ hours)
    if (needsScheduledBreaks && actHours >= 4 && cursor + 0.5 <= endHour) {
      result.push(schedule({ activityId: 'getting-ready', hours: 0.5 }, cursor, 0.5, 'rest after intense activity'))
      cursor += 0.5
    }
  }

  // 3. Lunch around noon
  if (needsScheduledBreaks && cursor <= 12.5 && endHour > 13) {
    const lunchHr = Math.max(cursor, 12)
    const lunchEnd = lunchHr + 1
    if (lunchEnd <= endHour) {
      if (lunchHr > cursor) {
        result.push(schedule({ activityId: 'travel-transit', hours: lunchHr - cursor }, cursor, lunchHr - cursor, 'travel'))
      }
      result.push(schedule({ activityId: 'meal-lunch', hours: 1 }, lunchHr, 1, 'lunch break'))
      cursor = lunchEnd
    }
  }

  // 4. Dinner in the evening
  if (needsScheduledBreaks && cursor <= 18 && endHour > 19) {
    const dinnerHr = Math.max(cursor, 18)
    const dinnerEnd = dinnerHr + 1
    if (dinnerEnd <= endHour) {
      if (dinnerHr > cursor) {
        result.push(schedule({ activityId: 'travel-transit', hours: dinnerHr - cursor }, cursor, dinnerHr - cursor, 'travel'))
      }
      result.push(schedule({ activityId: 'meal-dinner', hours: 1 }, dinnerHr, 1, 'dinner break'))
      cursor = dinnerEnd
    }
  }

  // 5. Evening wind-down
  if (cursor < endHour) {
    const remaining = Math.round((endHour - cursor) * 10) / 10
    if (remaining > 0) {
      result.push(schedule({ activityId: 'travel-transit', hours: remaining }, cursor, remaining, 'evening wind-down / head back'))
    }
  }

  return result
}

function reasoningFor(activity, profile, startHour) {
  if (!activity) return ''
  const tol = profile?.tolerances || {}
  const axes = ['noise', 'crowds', 'light', 'unpredictability']
  const reasons = []
  const warnings = []
  for (const axis of axes) {
    const userMax = tol[axis] ?? 3
    const level = activity.sensory?.[axis] ?? 0
    if (level <= userMax - 1) reasons.push(`${axis} well within your tolerance`)
    else if (level <= userMax) reasons.push(`${axis} at your edge — manageable`)
    if (level > userMax) warnings.push(`${axis} exceeds your tolerance (${level} vs your ${userMax})`)
  }

  // Add time-of-day suitability hint.
  if (startHour !== undefined && activity.crowdByHour) {
    const hourCrowd = activity.crowdByHour[Math.min(23, Math.max(0, Math.floor(startHour)))] ?? 0
    if (hourCrowd >= 4) {
      warnings.push(`very crowded at this hour (${hourCrowd}/5)`)
    } else if (hourCrowd <= 1) {
      reasons.push(`quiet time with low crowds (${hourCrowd}/5)`)
    }
  }

  if (activity.category === 'rest') reasons.push('recovery activity to lower the day\'s load')

  const parts = []
  if (reasons.length) parts.push(reasons.slice(0, 2).join('; '))
  if (warnings.length) parts.push('⚠ ' + warnings.join('; '))
  return parts.join(' | ') || 'matches your profile'
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }
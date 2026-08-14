// Mock LLM client. Designed to be swapped for a real provider by replacing
// this single function. Real implementation would send:
//   - system prompt (assistant role + safety + sensory-aware rules)
//   - user context (profile, history, today's raw items)
//   - expect a JSON itinerary back
// For the MVP, we run deterministic rules that mirror the prompt's intent.

import { ACTIVITIES, getActivityById } from '../data/activities.js'
import { activityLoad, isRest, dayLoad, capForProfile } from './sensory.js'
import { suitability, crowdAt } from './crowd.js'

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
function pickBestN({ pool, profile, preferences, modifiers, cap, maxItems, mustIncludeIds }) {
  const wantIndoors = modifiers.includes('indoors')
  const wantOutdoors = modifiers.includes('outdoors')
  const wantQuieter = modifiers.includes('quieter')
  const wantFood = modifiers.includes('add-food')
  const restEvery = modifiers.includes('more-rest') ? 1 : 2

  const isLandmark = (a) => {
    // Landmark IDs follow the pattern "city-slug", e.g. london-british-museum.
    // Google-sourced places start with "gmaps-".
    // Generic activities (museum-quiet, park-riverside, …) don't match either.
    return /^(?:[a-z]+-[a-z]+-|gmaps-)/.test(a.id)
  }

  // Score and rank.
  const ranked = pool
    .filter(a => !wantIndoors || isIndoor(a))
    .filter(a => !wantOutdoors || isOutdoor(a))
    .map(a => ({
      activity: a,
      score: suitability(a, profile),
      penalty: preferences.disliked?.includes(a.category) ? 30 : 0,
      landmarkBonus: isLandmark(a) ? 35 : 0,
      bonus: wantQuieter && activityLoad(a) <= 3 ? 25 : (wantQuieter ? -15 : 0),
    }))
    .map(x => ({ ...x, total: x.score - x.penalty + x.landmarkBonus + x.bonus }))
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
        picked.push({ activityId: rest.activity.id, hours: 1 })
        categories.add(rest.activity.category)
        sinceRest = 0
        load = dayLoad(picked)
      }
    }
    const projected = load + activityLoad(cand.activity)
    if (projected > cap) continue
    usedIds.add(cand.activity.id)
    picked.push({ activityId: cand.activity.id, hours: 1 })
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
export async function organiseItinerary({ date, items, profile, places, modifiers = [], instruction = '' }) {
  const pool = places || ACTIVITIES
  await delay(350)
  const cap = capForProfile(profile)

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
  if (parsed.constraints.length > 0 && parsed.remove.length === 0 && parsed.add.length === 0 && !parsed.swapOut) {
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

  // 5. Re-schedule: order items with rest interleaved.
  const decorated = working
    .filter(i => getActivityById(i.activityId, pool))
    .map(i => ({ ...i, activity: getActivityById(i.activityId, pool) }))

  const rests = decorated.filter(i => isRest(i.activity))
  const others = decorated.filter(i => !isRest(i.activity))
  others.sort((a, b) => activityLoad(a.activity) - activityLoad(b.activity))

  const ordered = []
  const startHour = computeStartHour(profile, modifiers)
  const restEvery = modifiers.includes('more-rest') ? 1 : 2
  let cursor = startHour
  let sinceRest = 0
  for (const item of others) {
    if (sinceRest >= restEvery && rests.length) {
      const rest = rests.shift()
      ordered.push(schedule(rest, cursor, rest.hours || 1, 'recovery break'))
      cursor += (rest.hours || 1)
      sinceRest = 0
    }
    const hours = item.hours || 1
    // Pick the activity's quietest window around the cursor.
    let bestHour = cursor
    let bestCrowd = crowdAt(item.activity, cursor)
    for (let h = Math.max(8, cursor - 1); h <= Math.min(20, cursor + 2); h++) {
      if (crowdAt(item.activity, h) < bestCrowd) { bestHour = h; bestCrowd = crowdAt(item.activity, h) }
    }
    if (bestHour < cursor) cursor = bestHour
    ordered.push(schedule(item, cursor, hours, reasoningFor(item.activity, profile)))
    cursor += hours
    sinceRest += 1
  }
  for (const rest of rests) {
    ordered.push(schedule(rest, Math.min(cursor, 19), rest.hours || 1, 'wind-down break'))
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

  return {
    items: ordered,
    notes: load > cap * 0.8
      ? `Loaded day (${load}/${cap}). Consider removing one item or adding a longer rest.`
      : `Comfortable load (${load}/${cap}).`,
  }
}

// GENERATE: no user input — pick activities from the catalogue that fit the profile.
export async function generateItinerary({ date, profile, preferences = {}, places, modifiers = [], instruction = '' }) {
  await delay(500)
  const pool = places || ACTIVITIES
  const cap = capForProfile(profile)

  const startHour = computeStartHour(profile, modifiers)
  const maxItems = computeMaxItems(modifiers, profile)

  const picked = pickBestN({
    pool, profile, preferences, modifiers, cap, maxItems,
  })

  // Schedule the picked items.
  const rests = picked.filter(a => {
    const act = getActivityById(a.activityId, pool)
    return act && isRest(act)
  })
  const others = picked.filter(a => {
    const act = getActivityById(a.activityId, pool)
    return !act || !isRest(act)
  })

  const ordered = []
  const restEvery = modifiers.includes('more-rest') ? 1 : 2
  let cursor = startHour
  let sinceRest = 0
  for (const item of others) {
    if (sinceRest >= restEvery && rests.length) {
      const rest = rests.shift()
      const act = getActivityById(rest.activityId, pool)
      ordered.push(schedule(rest, cursor, 1, act ? reasoningFor(act, profile) : 'recovery break'))
      cursor += 1
      sinceRest = 0
    }
    const act = getActivityById(item.activityId, pool)
    const hours = item.hours || 1
    let bestHour = cursor
    if (act) {
      let bestCrowd = crowdAt(act, cursor)
      for (let h = Math.max(8, cursor - 1); h <= Math.min(20, cursor + 2); h++) {
        if (crowdAt(act, h) < bestCrowd) { bestHour = h; bestCrowd = crowdAt(act, h) }
      }
    }
    if (bestHour < cursor) cursor = bestHour
    const reasoning = act ? reasoningFor(act, profile) : 'matches your profile'
    ordered.push(schedule(item, cursor, hours, reasoning))
    cursor += hours
    sinceRest += 1
  }
  for (const rest of rests) {
    const act = getActivityById(rest.activityId, pool)
    ordered.push(schedule(rest, Math.min(cursor, 19), 1, act ? reasoningFor(act, profile) : 'wind-down'))
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
        reasoningFor(extra.activity, profile),
      ))
      cursor += 1
    }
  }

  return {
    items: ordered,
    notes: `Auto-generated from your profile. Total load ${dayLoad(ordered)}/${cap}.`,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function computeStartHour(profile, modifiers) {
  let h = profile?.pace === 'slow' ? 10 : 9
  if (modifiers.includes('earlier')) h = Math.max(8, h - 2)
  if (modifiers.includes('later')) h = Math.min(13, h + 2)
  return h
}

function computeMaxItems(modifiers, profile) {
  let n = profile?.pace === 'packed' ? 6 : 4
  if (modifiers.includes('shorter')) n = Math.max(2, n - 2)
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

function reasoningFor(activity, profile) {
  if (!activity) return ''
  const tol = profile?.tolerances || {}
  const axes = ['noise', 'crowds', 'light', 'unpredictability']
  const reasons = []
  for (const axis of axes) {
    const userMax = tol[axis] ?? 3
    const level = activity.sensory?.[axis] ?? 0
    if (level <= userMax - 1) reasons.push(`${axis} well within your tolerance`)
    else if (level <= userMax) reasons.push(`${axis} at your edge — manageable`)
  }
  if (activity.category === 'rest') reasons.push('recovery activity to lower the day\'s load')
  return reasons.slice(0, 2).join('; ') || 'matches your profile'
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }
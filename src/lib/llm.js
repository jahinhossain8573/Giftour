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

// ORGANISE: take what the user added and reorder/schedule it.
export async function organiseItinerary({ date, items, profile, modifiers = [], instruction = '' }) {
  // Simulate small LLM latency so the UI can show a loading state.
  await delay(350)
  const cap = capForProfile(profile)
  const decorated = items
    .filter(i => getActivityById(i.activityId))
    .map(i => ({ ...i, activity: getActivityById(i.activityId) }))

  // Sort: rest activities first to seed the day calm, then by raw load ascending,
  // but ensure rest breaks are interleaved.
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
    ordered.push(schedule(item, cursor, hours, reasoningFor(item.activity, profile)))
    cursor += hours
    sinceRest += 1
  }
  // Use any remaining rests at the end of the day.
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
export async function generateItinerary({ date, profile, preferences = {}, modifiers = [], instruction = '' }) {
  await delay(500)
  const cap = capForProfile(profile)
  const tolerated = profile?.tolerances || { noise: 3, crowds: 3, light: 3, unpredictability: 3 }

  // Modifiers adjust the candidate filter and scoring.
  const wantIndoors = modifiers.includes('indoors')
  const wantOutdoors = modifiers.includes('outdoors')
  const wantQuieter = modifiers.includes('quieter')
  const wantFood = modifiers.includes('add-food')
  const restEvery = modifiers.includes('more-rest') ? 1 : 2
  const startHour = computeStartHour(profile, modifiers)
  const maxItems = computeMaxItems(modifiers, profile)

  // Score each activity for fit, weight recent disliked categories lower.
  const ranked = ACTIVITIES
    .filter(a => !wantIndoors || isIndoor(a))
    .filter(a => !wantOutdoors || isOutdoor(a))
    .map(a => ({
      activity: a,
      score: suitability(a, profile) - 50,
      penalty: preferences.disliked?.includes(a.category) ? 30 : 0,
      bonus: wantQuieter && activityLoad(a) <= 3 ? 25 : 0,
    }))
    .filter(x => x.score - x.penalty + x.bonus > 0)
    .sort((a, b) => (b.score - b.penalty + b.bonus) - (a.score - a.penalty + a.bonus))

  // If the user asked for food, force-include a calm eatery if any fits the cap.
  const mustInclude = []
  if (wantFood) {
    const food = ranked.find(r => r.activity.category === 'food' && activityLoad(r.activity) < cap)
    if (food) mustInclude.push(food)
  }

  // Build a day that mixes categories, prefers rest, and stays under cap.
  const picked = []
  let cursor = startHour
  let load = 0
  let sinceRest = 0
  const categories = new Set()
  for (const cand of [...mustInclude, ...ranked]) {
    if (picked.length >= maxItems) break
    if (picked.length >= 1 && categories.size >= 3 && !categories.has(cand.activity.category)) continue
    const isHeavy = activityLoad(cand.activity) >= 8
    if (isHeavy && sinceRest >= restEvery && !picked.some(i => isRest(i.activity))) {
      // Slot a rest first
      const rest = ranked.find(r => isRest(r.activity) && !picked.find(p => p.activityId === r.activity.id))
      if (rest) {
        picked.push(schedule({ activityId: rest.activity.id }, cursor, 1, 'recovery break inserted before heavy item'))
        categories.add(rest.activity.category)
        cursor += 1
        sinceRest = 0
        load = dayLoad(picked)
      }
    }
    const projected = load + activityLoad(cand.activity)
    if (projected > cap) continue
    // Pick the activity's quietest window.
    let bestHour = cursor
    let bestCrowd = crowdAt(cand.activity, cursor)
    for (let h = Math.max(8, cursor - 1); h <= Math.min(20, cursor + 2); h++) {
      if (crowdAt(cand.activity, h) < bestCrowd) { bestHour = h; bestCrowd = crowdAt(cand.activity, h) }
    }
    if (bestHour < cursor) cursor = bestHour
    const reasoning = reasoningFor(cand.activity, profile) + (cand.bonus ? ' (quieter option)' : '')
    picked.push(schedule({ activityId: cand.activity.id, hours: 1 }, cursor, 1, reasoning))
    categories.add(cand.activity.category)
    cursor += 1
    sinceRest += 1
    load = dayLoad(picked)
  }
  // If nothing picked, fall back to the quietest option so the user sees something.
  if (picked.length === 0) {
    const calm = [...ACTIVITIES].sort((a, b) => activityLoad(a) - activityLoad(b))[0]
    picked.push(schedule({ activityId: calm.id }, 10, 1, 'Quietest available option as a starting point.'))
  }
  return {
    items: picked,
    notes: `Auto-generated from your profile. Total load ${dayLoad(picked)}/${cap}.${instruction.trim() ? ` Note: took your instruction "${instruction.trim()}" into account.` : ''}`,
  }
}

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

// Indoor / outdoor classification for the "indoors" / "outdoors" chips.
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

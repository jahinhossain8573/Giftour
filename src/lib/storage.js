// localStorage wrapper. Single namespaced key so it's easy to wipe during testing.
// Companion data is stored separately under giftour.companion.<CODE>.

const KEY = 'giftour.v1'
const COMPANION_PREFIX = 'giftour.companion.'

const empty = {
  role: null,              // null | 'traveller' | 'companion'
  companionCode: null,     // string | null — generated for dependent travellers
  companionLink: null,     // string | null — code the companion entered to link
  profile: null,           // {name, tolerance, tolerances:{...}, interests:[], pace, rest, independence}
  itineraries: {},          // { 'YYYY-MM-DD': [ {id, activityId, startHour, hours, notes, completed, comfort} ] }
  feedbackLog: [],          // [{date, activityId, comfort}]  for profile refinement
  trips: {},                // { 'YYYY-MM-DD': {destination, duration, notes} }
  quizDone: false,
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(empty)
    const parsed = JSON.parse(raw)
    return { ...structuredClone(empty), ...parsed }
  } catch {
    return structuredClone(empty)
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    // If the traveller has a companion code, sync their data.
    if (state.role === 'traveller' && state.companionCode) {
      saveCompanionData(state.companionCode, {
        profile: state.profile,
        itineraries: state.itineraries,
        trips: state.trips,
        companionCode: state.companionCode,
      })
    }
  } catch (err) {
    console.warn('giftour: could not save state', err)
  }
}

export function clearState() {
  localStorage.removeItem(KEY)
}

// ─── Companion data ───────────────────────────────────────────────────

/** Write data to the companion's localStorage key. */
export function saveCompanionData(code, data) {
  try {
    localStorage.setItem(COMPANION_PREFIX + code, JSON.stringify(data))
  } catch (err) {
    console.warn('giftour: could not save companion data', err)
  }
}

/** Read data from a companion's localStorage key. Returns null if not found. */
export function loadCompanionData(code) {
  try {
    const raw = localStorage.getItem(COMPANION_PREFIX + code)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Remove companion data for a given code. */
export function clearCompanionData(code) {
  try {
    localStorage.removeItem(COMPANION_PREFIX + code)
  } catch (err) {
    console.warn('giftour: could not clear companion data', err)
  }
}

/** Generate a random companion code: 8 chars with dash, e.g. "A3K9-M2P7". */
export function generateCompanionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1 for clarity
  let code = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-'
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
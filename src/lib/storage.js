// localStorage wrapper. Single namespaced key so it's easy to wipe during testing.

const KEY = 'giftour.v1'

const empty = {
  profile: null,           // {name, tolerance, tolerances:{...}, interests:[], pace, rest}
  itineraries: {},          // { 'YYYY-MM-DD': [ {id, activityId, startHour, hours, notes, completed, comfort} ] }
  feedbackLog: [],          // [{date, activityId, comfort}]  for profile refinement
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
  } catch (err) {
    // Quota or private mode — surface in console for the developer.
    console.warn('giftour: could not save state', err)
  }
}

export function clearState() {
  localStorage.removeItem(KEY)
}

// Crowd + suitability helpers. In production these would call real APIs
// (Google Popular Times, TripAdvisor, etc.). For the MVP they're derived from
// the static sample data.

import { ACTIVITIES } from '../data/activities.js'
import { getActivityById as getActivityByIdFromPool } from '../data/activities.js'

// Re-export with the original signature: callers that don't know about the
// pool keep working unchanged. Places that have a pool (LLM, ItineraryEditor
// when it has a day) should use this and pass the pool explicitly.
export function getActivityById(id, pool) {
  return getActivityByIdFromPool(id, pool || ACTIVITIES)
}

// Predicted crowd at a given hour (0-23) for an activity.
export function crowdAt(activity, hour) {
  if (!activity || !activity.crowdByHour) return 0
  const h = Math.max(0, Math.min(23, hour))
  return activity.crowdByHour[h]
}

// Per-axis suitability for a user profile, 0-100. Higher = better fit.
// Penalises an activity whose sensory load exceeds the user's tolerance in any axis.
export function suitability(activity, profile) {
  if (!activity) return 0
  const tol = profile?.tolerances || { noise: 3, crowds: 3, light: 3, unpredictability: 3 }
  const axes = ['noise', 'crowds', 'light', 'unpredictability']
  let score = 100
  for (const axis of axes) {
    const userMax = tol[axis] ?? 3
    const placeLevel = activity.sensory?.[axis] ?? 0
    if (placeLevel > userMax) {
      score -= (placeLevel - userMax) * 18
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)))
}

// Crowd-adjusted suitability: the busier the predicted hour, the more we
// downgrade the score. Used when a specific start hour is known.
export function suitabilityAtHour(activity, profile, hour) {
  const base = suitability(activity, profile)
  const crowd = crowdAt(activity, hour)
  // Up to -25 points for the worst crowd level.
  return Math.max(0, base - crowd * 5)
}

// Recommend the least-crowded 1-hour window for an activity.
export function bestWindow(activity) {
  if (!activity?.crowdByHour) return { start: 10, crowd: 0 }
  let best = { start: 0, crowd: 99 }
  for (let h = 8; h <= 20; h++) {
    if (activity.crowdByHour[h] < best.crowd) best = { start: h, crowd: activity.crowdByHour[h] }
  }
  return best
}

export { ACTIVITIES }

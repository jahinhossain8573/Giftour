// Profile refinement: as the user marks activities comfortable/overwhelming,
// we gently adjust their per-axis tolerances. Small moves per event so the
// profile doesn't swing wildly from a single bad day.

import { AXES } from './sensory.js'

// comfort: 1 = comfortable, 0 = neutral, -1 = overwhelming
const DECAY = 0.95  // how much we trust older feedback vs new
const STEP = 0.15   // how much a single piece of feedback moves a tolerance

const DEFAULT_TOLERANCES = { noise: 3, crowds: 3, light: 3, unpredictability: 3 }

export function applyFeedback(profile, feedbackLog) {
  // Always return a usable profile object so downstream code can rely on
  // .tolerance existing. Without feedback, the profile is the input unchanged.
  if (!profile) return { tolerance: 3, tolerances: { ...DEFAULT_TOLERANCES } }
  if (!feedbackLog?.length) return profile
  // Start from current tolerances, or build defaults
  const tolerances = { ...(profile.tolerances || { noise: 3, crowds: 3, light: 3, unpredictability: 3 }) }
  let confidence = 0

  // Walk feedback newest -> oldest, decaying influence
  const sorted = [...feedbackLog].sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  for (const entry of sorted) {
    const activity = entry.activity
    if (!activity?.sensory) continue
    confidence = Math.min(1, confidence + (1 - confidence) * 0.3)
    for (const axis of AXES) {
      const level = activity.sensory[axis] || 0
      const userMax = tolerances[axis] ?? 3
      if (entry.comfort < 0 && level >= userMax) {
        // They were overwhelmed by something at or above their limit -> shrink the limit
        tolerances[axis] = Math.max(1, +(userMax - STEP * Math.max(0.3, confidence)).toFixed(2))
      } else if (entry.comfort > 0 && level < userMax - 1) {
        // They enjoyed something below their limit -> raise it a little
        tolerances[axis] = Math.min(5, +(userMax + STEP * 0.5 * Math.max(0.3, confidence)).toFixed(2))
      }
    }
  }
  // Roll up an overall tolerance from the axes.
  const overall = Math.round(AXES.reduce((s, a) => s + tolerances[a], 0) / AXES.length)
  return { ...profile, tolerances, tolerance: overall }
}

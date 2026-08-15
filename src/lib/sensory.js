// Sensory model: each activity has 4 axes (noise, crowds, light, unpredictability)
// each rated 0-5. Cumulative load = sum of weighted axis values minus recovery breaks.
// The user's daily cap is set by the onboarding quiz and adjusted by feedback.

export const AXES = ['noise', 'crowds', 'light', 'unpredictability']

export const axisLabels = {
  noise: 'Noise',
  crowds: 'Crowds',
  light: 'Light',
  unpredictability: 'Unpredictability',
}

// Weighted load for one activity given how long the user spends there (hours).
// Weights reflect that noise and crowds tend to be most fatiguing; tunable.
const AXIS_WEIGHTS = { noise: 1.2, crowds: 1.1, light: 0.8, unpredictability: 1.0 }

export function activityLoad(activity, hours = 1) {
  if (!activity || !activity.sensory) return 0
  const raw = AXES.reduce((sum, axis) => sum + (activity.sensory[axis] || 0) * AXIS_WEIGHTS[axis], 0)
  // Scale by duration; 1h is the baseline.
  return Math.round(raw * hours * 10) / 10
}

// Recovery break: low-stimulus activity that REDUCES load. Negative values.
export function isRest(activity) {
  if (!activity) return false
  return activityLoad(activity) < 0
}

export function dayLoad(activities) {
  return Math.round(activities.reduce((sum, a) => sum + activityLoad(a, a.hours || 1), 0) * 10) / 10
}

// Cap derived from profile. Lower tolerance = lower cap.
export function capForProfile(profile) {
  if (!profile) return 50
  const tolerance = profile.tolerance ?? 3
  // tolerance 1 (very low) -> cap 30, tolerance 3 (medium) -> cap 50, tolerance 5 (high) -> cap 70
  return 20 + tolerance * 10
}

export function budgetStatus(activities, profile) {
  const load = dayLoad(activities)
  const cap = capForProfile(profile)
  return {
    load,
    cap,
    remaining: Math.round((cap - load) * 10) / 10,
    percent: Math.min(100, Math.round((load / cap) * 100)),
    over: load > cap,
  }
}

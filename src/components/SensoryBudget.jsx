// Sensory budget meter + per-axis breakdown. Designed to be glanceable:
// colour alone never carries information (we also use numbers), and the
// fill bar uses a clear gradient that stays legible on a low-stimulation
// background. A short sentence tells the user what to do next.

import { budgetStatus, dayLoad, AXES, axisLabels } from '../lib/sensory.js'
import { getActivityById } from '../data/activities.js'

export default function SensoryBudget({ items, profile }) {
  const status = budgetStatus(items, profile)
  const perAxis = axisBreakdown(items)
  return (
    <section className="budget" aria-label="Sensory budget for the day">
      <header className="budget-header">
        <h3>Sensory budget</h3>
        <span className={`status-tag ${status.over ? 'over' : status.percent >= 80 ? 'tight' : 'ok'}`}>
          {status.over ? 'Over budget' : status.percent >= 80 ? 'Tight' : 'OK'}
        </span>
      </header>
      <div className="budget-meter" role="meter" aria-valuenow={status.load} aria-valuemin="0" aria-valuemax={status.cap}>
        <div className="budget-fill" style={{ width: `${Math.min(100, status.percent)}%` }} />
      </div>
      <p className="budget-numbers">
        <strong>{status.load}</strong> of {status.cap} used
        {' · '}
        {status.remaining >= 0 ? `${status.remaining} remaining` : `${Math.abs(status.remaining)} over`}
      </p>
      <p className="muted small">{advice(status, profile)}</p>
      <ul className="axis-list">
        {AXES.map(axis => (
          <li key={axis} className="axis-row">
            <span className="axis-name">{axisLabels[axis]}</span>
            <span className="axis-value">{perAxis[axis]}</span>
            <span className="axis-cap">/ {profile?.tolerances?.[axis] ?? 3} max comfortable</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function axisBreakdown(items) {
  // Per-axis load = max single activity's load on that axis (worst spike).
  // Easier for users to reason about than sum-of-axis-load, which is less intuitive.
  const out = { noise: 0, crowds: 0, light: 0, unpredictability: 0 }
  for (const it of items) {
    const a = getActivityById(it.activityId)
    if (!a?.sensory) continue
    for (const axis of AXES) {
      if (a.sensory[axis] > out[axis]) out[axis] = a.sensory[axis]
    }
  }
  return out
}

function advice(status, profile) {
  if (status.over) return 'You\'re over your daily cap. Remove a high-load activity or add a rest break.'
  if (status.percent >= 80) return 'You\'re close to your cap. Keep the rest of the day quiet if you can.'
  if (items.length === 0) return 'Pick a few activities and we\'ll keep an eye on your budget.'
  return 'Day looks manageable. Stay hydrated and take breaks as planned.'
}

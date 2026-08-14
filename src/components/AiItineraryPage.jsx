// AI Itinerary Page — shows 10–15 candidate attraction cards.
// The user taps to select/deselect their picks, then hits "Apply plan".
// If they pick more than the trip duration allows, they get a warning.
// No chat, no times — those are generated on apply.

import { useEffect, useState } from 'react'
import { rankCandidates, scheduleItems } from '../lib/llm.js'
import { getActivityById } from '../data/activities.js'
import { activityLoad, isRest } from '../lib/sensory.js'
import { suitabilityAtHour, crowdAt } from '../lib/crowd.js'

// Max selections based on trip duration and user tolerance.
function maxPicks(trip, profile) {
  const byDuration = { short: 3, half: 4, full: 7, overnight: 8 }
  const durationMax = byDuration[trip?.duration] || 4
  const tolerance = profile?.tolerance ?? 3
  if (tolerance <= 2) return Math.min(2, durationMax)
  if (tolerance === 3) return Math.min(4, durationMax)
  return durationMax
}

function bucket(load) {
  if (load <= 0) return 'rest'
  if (load < 6) return 'low'
  if (load < 12) return 'mid'
  return 'high'
}

export default function AiItineraryPage({ date, profile, preferences, trip, places, onApply, onStartOver, onBack, companionCode }) {
  const [phase, setPhase] = useState('loading')
  const [candidates, setCandidates] = useState([])
  const [selections, setSelections] = useState(new Set())
  const [error, setError] = useState(null)
  const [applyError, setApplyError] = useState(null)
  const pool = places || null

  // Load candidates on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await rankCandidates({
          profile, preferences, places, trip,
          count: 14,
        })
        if (cancelled) return
        setCandidates(result)
        // Pre-select top 4 (or whatever the trip max is).
        const max = maxPicks(trip, profile) || 4
        setSelections(new Set(result.slice(0, max).map(c => c.activityId)))
        setPhase('ready')
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Could not find attractions. Please try again.')
          setPhase('error')
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleCard = (id) => {
    setSelections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setApplyError(null)
  }

  const handleApply = () => {
    const max = maxPicks(trip, profile) || 4
    if (selections.size === 0) {
      setApplyError('Select at least one attraction.')
      return
    }
    if (selections.size > max) {
      setApplyError(
        `${selections.size} attractions is too many for a ${trip?.duration || 'full'}-day trip (max ${max}). Deselect some.`
      )
      return
    }
    setApplyError(null)

    const selectedItems = candidates.filter(c => selections.has(c.activityId))
    try {
      const scheduled = scheduleItems({ items: selectedItems, profile, trip, places })
      if (!scheduled || scheduled.length === 0) {
        setApplyError('Could not schedule your selections. Try different ones.')
        return
      }
      onApply(scheduled)
    } catch (e) {
      console.error('giftour: apply failed', e)
      setApplyError(e.message || 'Something went wrong. Try again.')
    }
  }

  // Loading
  if (phase === 'loading') {
    return (
      <section className="ai-page ai-page-loading" role="status">
        <div className="ai-page-skeleton">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <p className="muted small">Finding attractions…</p>
      </section>
    )
  }

  // Error
  if (phase === 'error') {
    return (
      <section className="ai-page ai-page-error">
        <div className="ai-page-error-icon" aria-hidden="true">!</div>
        <h2>Could not find attractions</h2>
        <p className="muted">{error}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Try again
        </button>
        <p className="muted small" style={{ marginTop: 8 }}>
          Try a different destination or adjust your trip details.
        </p>
      </section>
    )
  }

  const max = maxPicks(trip, profile) || 4
  const count = selections.size

  // Ready: card grid
  return (
    <section className="ai-page">
      <div className="trip-banner">
        <div>
          <strong>{trip?.destination}</strong>
          <span className="muted">
            {' · '}{durationLabel(trip?.duration)}
            {trip?.notes ? ` · ${trip.notes}` : ''}
          </span>
        </div>
      </div>

      <div className="candidate-counter">
        <span className="muted small">
          {count === 0
            ? `Pick up to ${max} attractions for your day`
            : `${count} of ${max} selected`}
        </span>
        {count > max && (
          <span className="candidate-counter-warn">
            Too many — deselect {count - max}
          </span>
        )}
      </div>

      <div className="candidate-grid">
        {candidates.map((it, i) => {
          const activity = getActivityById(it.activityId, pool)
          if (!activity) return null
          const isSelected = selections.has(it.activityId)
          const load = activityLoad(activity, 1)
          const crowd = crowdAt(activity, 12)
          const fit = suitabilityAtHour(activity, profile, 12)
          return (
            <button
              key={it.activityId || i}
              type="button"
              className={`candidate-card ${isSelected ? 'selected' : ''}`}
              onClick={() => toggleCard(it.activityId)}
              aria-pressed={isSelected}
            >
              {activity.photoUrl && (
                <div className="candidate-photo">
                  <img src={activity.photoUrl} alt={activity.name} loading="lazy" onError={(e) => { e.target.style.display = 'none' }} />
                </div>
              )}
              <div className="candidate-body">
                <div className="candidate-header">
                  <strong>{activity.name}</strong>
                  <span className={`load-pill load-${bucket(load)}`}>load {load}</span>
                </div>
                <div className="candidate-meta muted small">
                  {activity.location} · {activity.category}
                  {activity.rating ? ` · ${activity.rating}/5 ⭐` : ''}
                  {' · '}crowd {crowd}/5 · fit {fit}%
                </div>
                {activity.description && (
                  <p className="candidate-desc muted small">{activity.description}</p>
                )}
              </div>
              {isSelected && <span className="candidate-check" aria-hidden="true">✓</span>}
            </button>
          )
        })}
      </div>

      {companionCode && (
        <div className="companion-code-card">
          <span className="companion-code-label muted small">Companion Code</span>
          <span className="companion-code-value">{companionCode}</span>
          <button className="btn btn-ghost small" onClick={() => navigator.clipboard.writeText(companionCode)}>
            Copy code
          </button>
        </div>
      )}

      <div className="ai-page-footer">
        <button className="btn btn-primary" onClick={handleApply}>
          Apply plan ({count})
        </button>
        <button className="btn" onClick={() => onBack?.()}>
          Back
        </button>
        <button className="btn btn-ghost" onClick={() => onStartOver?.()}>
          Start over
        </button>
      </div>

      {applyError && <p className="error">{applyError}</p>}
    </section>
  )
}

function durationLabel(d) {
  return ({ short: 'A few hours', half: 'Half day', full: 'Full day', overnight: 'Overnight' }[d] || d)
}
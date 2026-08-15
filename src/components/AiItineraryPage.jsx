// AI Itinerary Page — shows 10–15 candidate attraction cards.
// The user taps to select/deselect their picks, then hits "Apply plan".
// If they pick more than the trip duration allows, they get a warning.
// No chat, no times — those are generated on apply.

import { useEffect, useState, useMemo } from 'react'
import { rankCandidates, scheduleItems } from '../lib/llm.js'
import { getActivityById, VISIT_HOURS, estimateHours, EXTRA_INTERESTS } from '../data/activities.js'
import { activityLoad, isRest, dayLoad, capForProfile } from '../lib/sensory.js'
import { suitabilityAtHour, crowdAt } from '../lib/crowd.js'
import { accessibilityBadge, accessibilityInfo } from '../lib/accessibility.js'

const TOUR_HOURS = 10 // Max actual touring/activity time per day

const VISIT_LABELS = {
  intense: { label: '>4 hours', hint: 'Takes most of the day', emoji: '🔴' },
  moderate: { label: '2–4 hours', hint: 'Half-day activity', emoji: '🟡' },
  light: { label: '<2 hours', hint: 'Quick stop', emoji: '🟢' },
}

function bucket(load) {
  if (load <= 0) return 'rest'
  if (load < 6) return 'low'
  if (load < 12) return 'mid'
  return 'high'
}
function bucketLabel(load) {
  const b = bucket(load)
  return b === 'rest' ? 'rest' : b === 'low' ? 'low' : b === 'mid' ? 'medium' : 'high'
}

export default function AiItineraryPage({ date, profile, preferences, trip, places, onApply, onStartOver, onBack, companionCode }) {
  const [phase, setPhase] = useState('loading')
  const [candidates, setCandidates] = useState([])
  const [selections, setSelections] = useState(new Set())
  const [extraSelections, setExtraSelections] = useState(new Set())
  const [error, setError] = useState(null)
  const [applyError, setApplyError] = useState(null)
  const pool = places || null

  // Group candidates by visitType — must be before early returns for hooks rules
  const groups = useMemo(() => {
    const grouped = { intense: [], moderate: [], light: [] }
    for (const c of candidates) {
      const vt = c.visitType || 'moderate'
      if (grouped[vt]) grouped[vt].push(c)
    }
    return grouped
  }, [candidates])

  // Load candidates when places data is available.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await rankCandidates({
          profile, preferences, places: pool, trip,
          count: 14,
        })
        if (cancelled) return
        setCandidates(result)
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
  }, [pool])

  // Auto-select the best combination once candidates and pool have real data.
  // Re-runs when pool changes (e.g. city data arrives after mount).
  useEffect(() => {
    if (phase !== 'ready' || candidates.length === 0) return
    // Wait until pool has real data with sensory info
    const hasRealData = pool && pool.length > 0 && candidates.some(c => {
      const a = getActivityById(c.activityId, pool)
      return a && a.sensory && a.sensory.noise !== undefined
    })
    if (!hasRealData) return

    const cap = capForProfile(profile)
    const selected = new Set()
    let hours = 0, load = 0

    const scored = candidates.map(c => {
      const a = getActivityById(c.activityId, pool)
      if (!a) return { ...c, value: 0, _h: 1, _l: 4 }
      const h = estimateHours(a)
      const l = activityLoad(a, h)
      const reviews = a.userRatingCount || 0
      const rating = a.rating || 0
      const popularity = reviews > 0 ? rating * Math.log10(reviews) : 0
      const landmarkBonus = /^(?:[a-z]+-[a-z]+-|gmaps-)/.test(a.id) ? 15 : 0
      return { ...c, value: c.score + popularity + landmarkBonus, _h: h, _l: l }
    }).filter(x => x._h > 0).sort((a, b) => b.value - a.value)

    for (const item of scored) {
      if (selected.size >= 6) break
      if (hours + item._h > TOUR_HOURS) continue
      if (item._l > cap || load + item._l > cap) continue
      selected.add(item.activityId)
      hours += item._h
      load += item._l
    }
    // Fallback: if nothing fits, try best value-to-load ratio within cap
    if (selected.size === 0 && scored.length > 0) {
      const best = scored.filter(x => x._l <= cap).sort((a, b) => (b.value / b._l) - (a.value / a._l))[0]
      if (best) selected.add(best.activityId)
    }
    // Safety check: if final selection still exceeds, clear it
    if (load > cap) {
      setSelections(new Set())
    } else {
      setSelections(selected)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pool])



  const toggleCard = (id) => {
    if (selections.has(id)) {
      setSelections(prev => { const n = new Set(prev); n.delete(id); return n })
      setApplyError(null)
      return
    }
    const a = getActivityById(id, pool)
    if (a) {
      const h = estimateHours(a)
      const l = activityLoad(a, h)
      if (usedHours + h > TOUR_HOURS) { setApplyError('Not enough time left in the day.'); return }
      const acc = accessibilityInfo(a)
      const alreadyHasAccessible = [...selections, ...extraSelections].some(id => {
        const act = getActivityById(id, pool) || EXTRA_INTERESTS.find(e => e.id === id)
        return act && accessibilityInfo(act).level === 'high'
      })
      if (!(acc.level === 'high' && !alreadyHasAccessible) && usedLoad + l > cap) {
        setApplyError('This exceeds your sensory budget.'); return
      }
    }
    setSelections(prev => { const n = new Set(prev); n.add(id); return n })
    setApplyError(null)
  }

  const toggleExtra = (id) => {
    if (extraSelections.has(id)) {
      setExtraSelections(prev => { const n = new Set(prev); n.delete(id); return n })
      return
    }
    const a = EXTRA_INTERESTS.find(e => e.id === id)
    if (a) {
      const h = estimateHours(a)
      const l = activityLoad(a, h)
      if (usedHours + h > TOUR_HOURS) { setApplyError('Not enough time left in the day.'); return }
      const acc = accessibilityInfo(a)
      const alreadyHasAccessible = [...selections, ...extraSelections].some(id => {
        const act = getActivityById(id, pool) || EXTRA_INTERESTS.find(e => e.id === id)
        return act && accessibilityInfo(act).level === 'high'
      })
      if (!(acc.level === 'high' && !alreadyHasAccessible) && usedLoad + l > cap) {
        setApplyError('This exceeds your sensory budget.'); return
      }
    }
    setExtraSelections(prev => { const n = new Set(prev); n.add(id); return n })
  }

  const handleApply = () => {
    const total = selections.size + extraSelections.size
    if (total === 0) {
      setApplyError('Select at least one attraction.')
      return
    }

    const selectedItems = candidates.filter(c => selections.has(c.activityId))
    const extraItems = EXTRA_INTERESTS.filter(e => extraSelections.has(e.id)).map(e => ({
      activityId: e.id,
      score: 100,
      visitType: e.visitType,
    }))
    const allItems = [...selectedItems, ...extraItems]

    // Check time budget: estimate total hours for selected items
    let totalHours = 0
    let totalSensoryLoad = 0
    const cap = capForProfile(profile)
    for (const item of allItems) {
      const activity = getActivityById(item.activityId, pool || null)
      if (activity) {
        totalHours += estimateHours(activity)
        totalSensoryLoad += activityLoad(activity, estimateHours(activity))
      }
    }
    if (totalHours > TOUR_HOURS) {
      setApplyError('Not enough time in the day for all these activities. Deselect some.')
      return
    }
    if (totalSensoryLoad > cap) {
      setApplyError('Too much sensory load for your profile. Deselect some intense activities.')
      return
    }

    setApplyError(null)
    try {
      const scheduled = scheduleItems({ items: allItems, profile, trip, places })
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

  const count = selections.size
  const extraCount = extraSelections.size
  const totalCount = count + extraCount

  // Compute time and sensory budget for selected items
  const cap = capForProfile(profile)
  let usedHours = 0
  let usedLoad = 0
  const allSelected = [...candidates.filter(c => selections.has(c.activityId)),
    ...EXTRA_INTERESTS.filter(e => extraSelections.has(e.id)).map(e => ({ activityId: e.id }))]
  for (const item of allSelected) {
    const a = getActivityById(item.activityId, pool)
    if (a) {
      usedHours += estimateHours(a)
      usedLoad += activityLoad(a, estimateHours(a))
    }
  }
  const hoursPercent = Math.min(100, Math.round((usedHours / TOUR_HOURS) * 100))
  const loadPercent = Math.min(100, Math.round((usedLoad / cap) * 100))

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
          {totalCount === 0
            ? 'Pick attractions for your day'
            : `${totalCount} selected`}
        </span>
      </div>

      {/* Time and sensory budget meters — visual only */}
      {totalCount > 0 && (
        <div className="budget-meters">
          <div className="budget-meter-row">
            <span className="budget-meter-label muted small">Time</span>
            <div className="budget-meter-track">
              <div className="budget-meter-fill" style={{ width: `${hoursPercent}%`, background: hoursPercent > 90 ? 'var(--danger)' : hoursPercent > 70 ? '#c8a04a' : 'var(--primary)' }} />
            </div>
          </div>
          <div className="budget-meter-row">
            <span className="budget-meter-label muted small">Sensory</span>
            <div className="budget-meter-track">
              <div className="budget-meter-fill" style={{ width: `${loadPercent}%`, background: loadPercent > 90 ? 'var(--danger)' : loadPercent > 70 ? '#c8a04a' : '#6b8a5a' }} />
            </div>
          </div>
        </div>
      )}

      {['intense', 'moderate', 'light'].map(type => {
        const items = groups[type]
        if (!items || items.length === 0) return null
        const info = VISIT_LABELS[type]
        return (
          <div key={type} className="candidate-group">
            <h3 className="candidate-group-title">
              <span>{info.emoji}</span> {info.label}
              <span className="candidate-group-hint">{info.hint}</span>
            </h3>
            <div className="candidate-grid">
              {items.map((it, i) => {
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
                        <span className={`load-pill load-${bucket(load)}`} title={`Sensory load: ${load}`}>{bucketLabel(load)}</span>
                      </div>
                      <div className="candidate-meta muted small">
                        {activity.location} · {activity.category}
                        {activity.rating ? ` · ${activity.rating}/5 ⭐` : ''}
                        {' · '}crowd {crowd}/5 · fit {fit}%
                        {' · '}<span className="visit-badge">{estimateHours(activity)}h</span>
                        {accessibilityBadge(activity) && <span className="access-badge">{accessibilityBadge(activity)}</span>}
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
          </div>
        )
      })}

      {/* Extra interests */}
      <div className="candidate-group">
        <h3 className="candidate-group-title">
          <span>➕</span> Extra Interests
          <span className="candidate-group-hint">Add-ons for your day</span>
        </h3>
        <div className="extra-grid">
          {EXTRA_INTERESTS.map(e => {
            const isSelected = extraSelections.has(e.id)
            const hours = estimateHours(e)
            return (
              <button
                key={e.id}
                type="button"
                className={`candidate-card ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleExtra(e.id)}
                aria-pressed={isSelected}
              >
                <div className="candidate-body">
                  <div className="candidate-header">
                    <strong>{e.name}</strong>
                    <span className={`load-pill load-${bucket(activityLoad(e))}`}>load {activityLoad(e)}</span>
                  </div>
                  <div className="candidate-meta muted small">
                    {e.category} · <span className="visit-badge">{hours}h</span>
                    {accessibilityBadge(e) && <span className="access-badge">{accessibilityBadge(e)}</span>}
                  </div>
                  <p className="candidate-desc muted small">{e.description}</p>
                </div>
                {isSelected && <span className="candidate-check" aria-hidden="true">✓</span>}
              </button>
            )
          })}
        </div>
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
          Apply plan ({totalCount})
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
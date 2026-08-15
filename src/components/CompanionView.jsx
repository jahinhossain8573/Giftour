// Companion view — read-only monitoring of a traveller's itinerary.
// Shows the current day's plan, sensory budget, and activity timeline.
// Auto-refreshes via the storage event when the traveller's tab updates.

import { useEffect, useState } from 'react'
import { loadCompanionData } from '../lib/storage.js'
import { getActivityById } from '../data/activities.js'
import { activityLoad, isRest, budgetStatus, AXES, axisLabels } from '../lib/sensory.js'
import { suitabilityAtHour, crowdAt } from '../lib/crowd.js'

function hourLabel(h) {
  const hour = Math.floor(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const display = hour % 12 || 12
  return `${display}:00 ${ampm}`
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

function durationLabel(d) {
  return ({ short: 'A few hours', half: 'Half day', full: 'Full day', overnight: 'Overnight' }[d] || d)
}

export default function CompanionView({ code, onDisconnect }) {
  const [data, setData] = useState(() => loadCompanionData(code))

  // Auto-refresh when the traveller's tab saves to localStorage.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === `giftour.companion.${code}`) {
        setData(loadCompanionData(code))
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [code])

  const refresh = () => setData(loadCompanionData(code))

  if (!data) {
    return (
      <section className="ai-page ai-page-error">
        <div className="ai-page-error-icon" aria-hidden="true">!</div>
        <h2>No data found</h2>
        <p className="muted">No traveller data found for code <strong>{code}</strong>. Ask them to open the app and share their code.</p>
        <button className="btn" onClick={onDisconnect}>Disconnect</button>
      </section>
    )
  }

  const { profile, itineraries, trips } = data
  // Show the first planned date.
  const dateKeys = Object.keys(itineraries || {}).sort()
  const activeDate = dateKeys[0] || null
  const items = activeDate ? (itineraries[activeDate] || []) : []
  const trip = activeDate ? (trips?.[activeDate] || null) : null
  const status = budgetStatus(items, profile)
  const perAxis = axisBreakdown(items)

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <img src="/favicon.png" alt="Giftour" className="logo" />
          <p className="tagline muted small">
            Monitoring {profile?.name || 'Traveller'} · Code: {code}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={refresh}>Refresh</button>
          <button className="btn btn-ghost danger" onClick={onDisconnect}>Disconnect</button>
        </div>
      </header>

      <main className="container" style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
        {trip && (
          <div className="trip-banner" style={{ marginBottom: 16 }}>
            <div>
              <strong>{trip.destination}</strong>
              <span className="muted"> · {durationLabel(trip.duration)}{trip.notes ? ` · ${trip.notes}` : ''}</span>
            </div>
          </div>
        )}

        {activeDate && (
          <p className="muted small" style={{ marginBottom: 12 }}>
            Showing itinerary for <strong>{activeDate}</strong>
          </p>
        )}

        {/* Sensory budget */}
        <section className="budget" aria-label="Sensory budget" style={{ marginBottom: 16 }}>
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

        {/* Activity timeline */}
        {items.length === 0 ? (
          <p className="muted" style={{ fontStyle: 'italic' }}>No activities planned yet.</p>
        ) : (
          <ol className="ai-timeline">
            {items.map((it, i) => {
              const activity = getActivityById(it.activityId)
              if (!activity) return null
              const load = activityLoad(activity, it.hours)
              const crowd = crowdAt(activity, it.startHour)
              const fit = suitabilityAtHour(activity, profile, it.startHour)
              return (
                <li key={it.id || i} className={`ai-timeline-item ${isRest(activity) ? 'is-rest' : ''}`}>
                  <div className="ai-timeline-marker" />
                  <time className="ai-timeline-time">{hourLabel(it.startHour)}</time>
                  <div className="ai-timeline-content">
                    <div className="ai-timeline-card">
                      {activity.photoUrl && (
                        <div className="ai-timeline-photo">
                          <img src={activity.photoUrl} alt={activity.name} loading="lazy" onError={(e) => { e.target.style.display = 'none' }} />
                        </div>
                      )}
                      <div className="ai-timeline-card-body">
                        <div className="ai-timeline-header">
                          <strong>{activity.name}</strong>
                          {isRest(activity) && <span className="rest-tag">rest</span>}
                          <span className={`load-pill load-${bucket(load)}`} title={`Sensory load: ${load}`}>{bucketLabel(load)}</span>
                        </div>
                        <div className="ai-timeline-meta muted small">
                          {activity.location} · {activity.category}
                          {activity.rating ? ` · ${activity.rating}/5 ⭐` : ''}
                          {' · '}crowd {crowd}/5 · fit {fit}%
                          {it.completed && <span> · ✅ done</span>}
                        </div>
                        {it.completed && it.comfort !== 0 && (
                          <span className={`feedback-tag`} data-comfort={it.comfort} style={{ marginTop: 4, display: 'inline-block' }}>
                            {it.comfort > 0 ? 'Comfortable' : 'Overwhelming'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </main>
    </div>
  )
}

function axisBreakdown(items) {
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
// Itinerary editor for one date. Shows current slots, lets the user add new
// items from the catalogue, edit hours/notes, and mark each as completed with
// a comfort rating. The comfort ratings flow back into the profile.

import { useState } from 'react'
import { ACTIVITIES, getActivityById } from '../data/activities.js'
import { activityLoad, isRest } from '../lib/sensory.js'
import { suitability, suitabilityAtHour, crowdAt } from '../lib/crowd.js'

const hourLabel = (h) => `${String(Math.floor(h)).padStart(2, '0')}:00`

export default function ItineraryEditor({ date, items, profile, onChange, onLogFeedback }) {
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('')

  const add = (activityId) => {
    const activity = getActivityById(activityId)
    if (!activity) return
    const last = items[items.length - 1]
    const startHour = last ? Math.min(20, (last.startHour || 9) + (last.hours || 1)) : 9
    const slot = {
      id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      activityId,
      startHour,
      hours: 1,
      notes: '',
      completed: false,
      comfort: 0,
    }
    onChange([...items, slot])
    setShowAdd(false)
    setFilter('')
  }

  const updateSlot = (id, patch) => {
    onChange(items.map(it => it.id === id ? { ...it, ...patch } : it))
  }

  const remove = (id) => onChange(items.filter(it => it.id !== id))

  const markComplete = (it, comfort) => {
    updateSlot(it.id, { completed: true, comfort })
    onLogFeedback({ date, activityId: it.activityId, comfort })
  }

  const filtered = ACTIVITIES.filter(a =>
    !filter || a.name.toLowerCase().includes(filter.toLowerCase()) || a.category.includes(filter.toLowerCase())
  )

  return (
    <section className="editor">
      <header className="editor-header">
        <h2>{formatDate(date)}</h2>
        <button className="btn btn-primary" onClick={() => setShowAdd(s => !s)}>
          {showAdd ? 'Close' : '+ Add activity'}
        </button>
      </header>

      {showAdd && (
        <div className="add-panel">
          <input
            className="text-input"
            type="text"
            placeholder="Search activities"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            autoFocus
          />
          <ul className="add-list">
            {filtered.map(a => {
              const fit = suitability(a, profile)
              return (
                <li key={a.id} className="add-item">
                  <div className="add-item-text">
                    <strong>{a.name}</strong>
                    <span className="muted"> {a.location} · {a.category}</span>
                    <p className="muted small">{a.description}</p>
                  </div>
                  <div className="add-item-side">
                    <span className="fit-badge" title="Fit for your profile">{fit}%</span>
                    <button className="btn" onClick={() => add(a.id)}>Add</button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {items.length === 0 ? (
        <p className="empty">No activities yet. Add one above or use AI to generate a day.</p>
      ) : (
        <ol className="slot-list">
          {items.map(it => {
            const activity = getActivityById(it.activityId)
            if (!activity) return null
            const fit = suitabilityAtHour(activity, profile, it.startHour)
            const crowd = crowdAt(activity, it.startHour)
            const load = activityLoad(activity, it.hours)
            return (
              <li key={it.id} className={`slot ${isRest(activity) ? 'slot-rest' : ''} ${it.completed ? 'slot-done' : ''}`}>
                <div className="slot-time">
                  <input
                    type="number"
                    min="0" max="23"
                    className="hour-input"
                    value={it.startHour}
                    onChange={e => updateSlot(it.id, { startHour: clamp(parseInt(e.target.value, 10) || 0, 0, 23) })}
                    aria-label="Start hour"
                  />
                  <span className="muted small">{hourLabel(it.startHour)}</span>
                </div>
                <div className="slot-main">
                  <div className="slot-title">
                    <strong>{activity.name}</strong>
                    {isRest(activity) && <span className="rest-tag">rest</span>}
                    <span className={`load-pill load-${bucket(load)}`} title="Sensory load">load {load}</span>
                  </div>
                  <div className="slot-meta muted small">
                    {activity.location} · {activity.category}
                    {' · '}
                    <span title="Predicted crowd level">crowd {crowd}/5</span>
                    {' · '}
                    <span title="Suitability at this hour">fit {fit}%</span>
                  </div>
                  <input
                    className="text-input slot-notes"
                    placeholder="Notes (what to bring, who to call, what to avoid…)"
                    value={it.notes}
                    onChange={e => updateSlot(it.id, { notes: e.target.value })}
                  />
                </div>
                <div className="slot-side">
                  <label className="hours-label">
                    hrs
                    <input
                      type="number"
                      min="0.5" max="8" step="0.5"
                      className="hours-input"
                      value={it.hours}
                      onChange={e => updateSlot(it.id, { hours: Math.max(0.5, parseFloat(e.target.value) || 1) })}
                      aria-label="Hours"
                    />
                  </label>
                  {!it.completed ? (
                    <div className="feedback-row">
                      <button className="btn btn-ghost small" onClick={() => markComplete(it, 1)} title="Mark as comfortable">✓</button>
                      <button className="btn btn-ghost small" onClick={() => markComplete(it, -1)} title="Mark as overwhelming">✗</button>
                    </div>
                  ) : (
                    <div className="feedback-row">
                      <span className="feedback-tag" data-comfort={it.comfort}>
                        {it.comfort > 0 ? 'comfortable' : it.comfort < 0 ? 'overwhelming' : 'neutral'}
                      </span>
                    </div>
                  )}
                  <button className="btn btn-ghost small danger" onClick={() => remove(it.id)} aria-label="Remove">×</button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function bucket(load) {
  if (load <= 0) return 'rest'
  if (load < 6) return 'low'
  if (load < 12) return 'mid'
  return 'high'
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }
function formatDate(iso) {
  if (!iso) return 'Pick a date'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

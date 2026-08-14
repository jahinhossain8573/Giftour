// Trip setup step: shown the first time a user picks a date, unless they've
// already filled it in. Captures a destination and how long the user expects
// to be out that day (a few hours, full day, overnight). This is the context
// the AI uses to pick and pace activities.

import { useState, useEffect } from 'react'

const DURATIONS = [
  { value: 'short', label: 'A few hours', help: '~2–3 hours, light day' },
  { value: 'half', label: 'Half day', help: '~4–5 hours, 1–2 main things' },
  { value: 'full', label: 'Full day', help: 'Most of the day out' },
  { value: 'overnight', label: 'Overnight', help: 'Includes evening + next morning' },
]

export default function TripSetup({ date, initial, onSave, onCancel }) {
  const [destination, setDestination] = useState(initial?.destination || '')
  const [duration, setDuration] = useState(initial?.duration || 'full')
  const [notes, setNotes] = useState(initial?.notes || '')

  // Focus the first field when the form appears.
  useEffect(() => {
    const el = document.getElementById('trip-destination')
    if (el) el.focus()
  }, [])

  const canSave = destination.trim().length > 0

  return (
    <div className="trip-setup" role="region" aria-label="Trip details">
      <h2>Where are you going?</h2>
      <p className="muted">Tell us a bit about this day. The AI uses this to pick suitable places.</p>

      <label className="trip-label" htmlFor="trip-destination">
        Destination
        <input
          id="trip-destination"
          className="text-input"
          type="text"
          placeholder="e.g. Central London, downtown Toronto, Kyoto…"
          value={destination}
          onChange={e => setDestination(e.target.value)}
        />
      </label>

      <fieldset className="trip-duration">
        <legend>How long will you be out?</legend>
        <div className="trip-duration-grid">
          {DURATIONS.map(opt => (
            <button
              type="button"
              key={opt.value}
              className={`trip-duration-btn ${duration === opt.value ? 'selected' : ''}`}
              onClick={() => setDuration(opt.value)}
              aria-pressed={duration === opt.value}
            >
              <strong>{opt.label}</strong>
              <span className="muted small">{opt.help}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="trip-label" htmlFor="trip-notes">
        Anything else? <span className="muted small">(optional)</span>
        <textarea
          id="trip-notes"
          className="text-input"
          rows={2}
          placeholder="e.g. avoid stairs, must be near a toilet, no flying…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </label>

      <div className="trip-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Back</button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onSave({ destination: destination.trim(), duration, notes: notes.trim() })}
          disabled={!canSave}
        >
          {initial ? 'Save changes' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

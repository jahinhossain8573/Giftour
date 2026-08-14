// AI Itinerary Page — a full-page view shown right after trip setup.
//
// Phase 1: loading skeleton while the LLM generates the first plan.
// Phase 2: timeline of generated activities + chat interface for refinements.
// Phase 3: user applies the plan and transitions to the day-of editor view.
//
// The chat and modifier chips mirror the AiPanel pattern but are integrated
// directly into the page so the generated plan is always visible alongside
// the conversation.

import { useEffect, useRef, useState } from 'react'
import { generateItinerary, organiseItinerary } from '../lib/llm.js'
import { getActivityById } from '../data/activities.js'
import { activityLoad, isRest } from '../lib/sensory.js'
import { suitabilityAtHour, crowdAt } from '../lib/crowd.js'
import { matchCity } from '../lib/places.js'

const MODIFIER_CHIPS = [
  { id: 'quieter', label: 'Make it quieter' },
  { id: 'more-rest', label: 'Add a rest break' },
  { id: 'earlier', label: 'Start earlier' },
  { id: 'later', label: 'Start later' },
  { id: 'add-food', label: 'Add food' },
  { id: 'outdoors', label: 'Prefer outdoors' },
  { id: 'indoors', label: 'Keep it indoors' },
  { id: 'shorter', label: 'Shorter day' },
  { id: 'less-walking', label: 'Less walking' },
]

function hourLabel(h) {
  return `${String(Math.floor(h)).padStart(2, '0')}:00`
}

function bucket(load) {
  if (load <= 0) return 'rest'
  if (load < 6) return 'low'
  if (load < 12) return 'mid'
  return 'high'
}

export default function AiItineraryPage({ date, profile, preferences, trip, places, onApply }) {
  const [phase, setPhase] = useState('loading') // loading | ready | error
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState([])
  const [instruction, setInstruction] = useState('')
  const [messages, setMessages] = useState([])
  const [applied, setApplied] = useState(false)
  const threadRef = useRef(null)
  const pool = places || null
  const matched = trip?.destination ? matchCity(trip.destination) : null

  // ——— Auto-generate on mount ———
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const result = await generateItinerary({
          date, profile, preferences, places, trip,
        })
        if (cancelled) return
        setItems(result.items)
        setMessages([{
          id: uid(),
          role: 'assistant',
          text: matched
            ? `I've picked calm ${matched.name} options for your day. Tell me what to change — fewer crowds, swap a museum for a park, finish by 4pm, anything.`
            : `I've put together a plan based on your profile. Tell me what to change — fewer crowds, swap a museum for a park, finish by 4pm, anything.`,
          items: result.items,
        }])
        setPhase('ready')
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Could not generate a plan. Please try again.')
          setPhase('error')
        }
      }
    })()
    return () => { cancelled = true }
    // Only run on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll the chat thread.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const toggleChip = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  const sendChat = async () => {
    const text = instruction.trim()
    if (!text || busy || !items) return
    setInstruction('')
    setError(null)
    setBusy(true)
    setMessages(m => [...m, { id: uid(), role: 'user', text }])
    try {
      const result = await organiseItinerary({
        date, items, profile, preferences,
        modifiers: selected, instruction: text, places, trip,
      })
      setItems(result.items)
      setMessages(m => [...m, {
        id: uid(), role: 'assistant',
        text: result.notes || 'Here is the updated plan.',
        items: result.items,
      }])
    } catch (e) {
      setError(e.message)
      setMessages(m => [...m, {
        id: uid(), role: 'assistant',
        text: `Sorry, I couldn't do that — ${e.message}`,
      }])
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async () => {
    if (busy) return
    setBusy(true); setError(null)
    setMessages(m => [...m, { id: uid(), role: 'user', text: 'Generate a new plan' }])
    try {
      const result = await generateItinerary({
        date, profile, preferences, modifiers: selected, places, trip,
      })
      setItems(result.items)
      setMessages(m => [...m, {
        id: uid(), role: 'assistant',
        text: result.notes || 'Here is a fresh plan.',
        items: result.items,
      }])
    } catch (e) {
      setError(e.message)
      setMessages(m => [...m, {
        id: uid(), role: 'assistant',
        text: `Sorry, I couldn't do that — ${e.message}`,
      }])
    } finally {
      setBusy(false)
    }
  }

  const handleApply = () => {
    if (!items) return
    setApplied(true)
    onApply(items)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendChat()
    }
  }

  // ——— Loading state ———
  if (phase === 'loading') {
    return (
      <section className="ai-page ai-page-loading" role="status">
        <div className="ai-page-skeleton">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line" />
          <div className="skeleton skeleton-line short" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <p className="muted small">Planning your day…</p>
      </section>
    )
  }

  // ——— Error state ———
  if (phase === 'error') {
    return (
      <section className="ai-page ai-page-error">
        <div className="ai-page-error-icon" aria-hidden="true">!</div>
        <h2>Could not generate a plan</h2>
        <p className="muted">{error}</p>
        <button className="btn btn-primary" onClick={() => { setPhase('loading'); setError(null); window.location.reload() }}>
          Try again
        </button>
        <p className="muted small" style={{ marginTop: 8 }}>
          You can also go back and adjust your trip details, then try again.
        </p>
      </section>
    )
  }

  // ——— Applied state (show brief confirmation before parent transitions) ———
  if (applied) {
    return (
      <section className="ai-page ai-page-applied">
        <div className="ai-page-applied-icon" aria-hidden="true">✓</div>
        <h2>Plan applied!</h2>
        <p className="muted">Your itinerary is saved. You can now edit times, add notes, and mark activities as you go.</p>
      </section>
    )
  }

  // ——— Ready state: timeline + chat ———
  return (
    <section className="ai-page">
      {/* Trip banner */}
      <div className="trip-banner">
        <div>
          <strong>{trip?.destination}</strong>
          <span className="muted">
            {' · '}{durationLabel(trip?.duration)}
            {trip?.notes ? ` · ${trip.notes}` : ''}
          </span>
        </div>
      </div>

      {/* Modifier chips */}
      <div className="ai-chips" role="group" aria-label="Quick modifications">
        {MODIFIER_CHIPS.map(chip => {
          const on = selected.includes(chip.id)
          return (
            <button
              type="button"
              key={chip.id}
              className={`ai-chip ${on ? 'selected' : ''}`}
              onClick={() => toggleChip(chip.id)}
              aria-pressed={on}
            >
              {chip.label}
            </button>
          )
        })}
      </div>

      {/* Timeline of generated items */}
      <ol className="ai-timeline">
        {(items || []).map((it, i) => {
          const activity = getActivityById(it.activityId, pool)
          if (!activity) return null
          const load = activityLoad(activity, it.hours)
          const crowd = crowdAt(activity, it.startHour)
          const fit = suitabilityAtHour(activity, profile, it.startHour)
          return (
            <li key={it.id || i} className={`ai-timeline-item ${isRest(activity) ? 'is-rest' : ''}`}>
              <div className="ai-timeline-marker" />
              <time className="ai-timeline-time">{hourLabel(it.startHour)}</time>
              <div className="ai-timeline-content">
                <div className="ai-timeline-header">
                  <strong>{activity.name}</strong>
                  {isRest(activity) && <span className="rest-tag">rest</span>}
                  <span className={`load-pill load-${bucket(load)}`}>load {load}</span>
                </div>
                <div className="ai-timeline-meta muted small">
                  {activity.location} · {activity.category}
                  {' · '}crowd {crowd}/5 · fit {fit}%
                </div>
                {it.hours && (
                  <span className="muted small">{it.hours}h</span>
                )}
                {it.reasoning && (
                  <p className="ai-timeline-reason muted small">{it.reasoning}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Action buttons */}
      <div className="ai-page-footer">
        <button
          className="btn btn-primary"
          onClick={handleApply}
          disabled={busy || !items}
        >
          Apply plan
        </button>
        <button
          className="btn"
          onClick={regenerate}
          disabled={busy}
        >
          Start over
        </button>
      </div>

      {/* Chat thread */}
      <div className="chat-section">
        <div className="chat-thread" ref={threadRef} aria-live="polite">
          {messages.map(m => (
            <div key={m.id} className={`chat-msg ${m.role}`}>
              <div className="chat-bubble">{m.text}</div>
              {m.items && (
                <div className="chat-plan">
                  <ul className="ai-reason-list">
                    {m.items.map((it, idx) => (
                      <li key={it.id || idx} className="ai-reason">
                        <span className="ai-reason-dot" /> {it.reasoning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="chat-msg assistant">
              <div className="chat-bubble thinking">Thinking…</div>
            </div>
          )}
        </div>

        <div className="chat-input-row">
          <textarea
            className="text-input chat-input"
            rows={2}
            placeholder="Tell the AI what to change…"
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            aria-label="Chat with AI"
          />
          <div className="chat-input-buttons">
            <button
              className="btn btn-primary"
              onClick={sendChat}
              disabled={busy || !instruction.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
    </section>
  )
}

function uid() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function durationLabel(d) {
  return ({
    short: 'A few hours',
    half: 'Half day',
    full: 'Full day',
    overnight: 'Overnight',
  }[d] || d)
}
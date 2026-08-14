// AI assist panel.
//
// After the user finishes trip setup, the parent auto-runs "generate" once
// and applies the result. This panel then offers one-tap modification chips
// and a real multi-turn chat thread to refine the day without starting over.
//
// Each user message re-runs organiseItinerary against the *current* items and
// the typed instruction, so back-and-forth is genuinely iterative: "make it
// quieter" → "skip museums" → "add a park near the river" all compose.
//
// The mock LLM in lib/llm.js accepts a `modifiers` array (chip ids the user
// picked) and an `instruction` string. In production these would be passed
// to the real LLM as natural-language additions to the system prompt.

import { useEffect, useRef, useState } from 'react'
import { organiseItinerary, generateItinerary } from '../lib/llm.js'
import { matchCity } from '../lib/places.js'

// Each chip maps to a short hint the LLM understands. Keep vocabulary tight
// so the prompt instructions stay consistent and easy to reason about.
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

const WELCOME = (matched) => matched
  ? `Hi! I've started you off with calm ${matched} picks. Tell me what to change — fewer crowds, swap a museum for a park, finish by 4pm, anything.`
  : `Hi! I've started you off with calm picks. Tell me what to change — fewer crowds, swap a museum for a park, finish by 4pm, anything.`

export default function AiPanel({ date, items, profile, preferences, trip, places, onApply, disabled }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState([]) // chip ids currently active
  const [instruction, setInstruction] = useState('')
  // Chat thread. Each message is { role, text, items?, id }. The thread is
  // session-only — we don't persist it because it's noise across reloads and
  // the underlying items (which ARE persisted) hold the actual state.
  const [messages, setMessages] = useState([])
  const threadRef = useRef(null)

  // Greet on first render with a non-actionable assistant message so the
  // thread isn't visually empty.
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{ id: greetId(), role: 'assistant', text: WELCOME(trip?.destination ? matchedName(trip.destination) : null) }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the latest messages in view as the thread grows.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const toggleChip = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  const send = async () => {
    const text = instruction.trim()
    if (!text || busy) return
    setInstruction('')
    setError(null)
    setBusy(true)
    setMessages(m => [...m, { id: greetId(), role: 'user', text }])
    try {
      const result = await organiseItinerary({
        date, items, profile, preferences,
        modifiers: selected, instruction: text, places, trip,
      })
      setMessages(m => [...m, {
        id: greetId(), role: 'assistant',
        text: result.notes || 'Here is what I came up with.',
        items: result.items,
      }])
    } catch (e) {
      setError(e.message)
      setMessages(m => [...m, { id: greetId(), role: 'assistant', text: `Sorry, I couldn't do that — ${e.message}` }])
    } finally {
      setBusy(false)
    }
  }

  const startOver = async () => {
    if (busy) return
    setBusy(true); setError(null)
    setMessages(m => [...m, { id: greetId(), role: 'user', text: 'Generate a new plan' }])
    try {
      const result = await generateItinerary({
        date, profile, preferences, modifiers: selected, places, trip,
      })
      setMessages(m => [...m, {
        id: greetId(), role: 'assistant',
        text: result.notes || 'Here is a fresh plan.',
        items: result.items,
      }])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const apply = (items) => onApply(items)
  const onKeyDown = (e) => {
    // Enter sends, Shift+Enter inserts a newline. Standard chat affordance.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <section className="ai-panel">
      <header className="ai-header">
        <h3>AI assist</h3>
        <span className="muted small">local mock LLM · swap in your provider in src/lib/llm.js</span>
      </header>

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

      <div className="chat-thread" ref={threadRef} aria-live="polite">
        {messages.map(m => (
          <div key={m.id} className={`chat-msg ${m.role}`}>
            <div className="chat-bubble">{m.text}</div>
            {m.items && (
              <div className="chat-plan">
                <ul className="ai-reason-list">
                  {m.items.map((it, i) => (
                    <li key={it.id || i} className="ai-reason">
                      <span className="ai-reason-dot" /> {it.reasoning}
                    </li>
                  ))}
                </ul>
                <div className="ai-result-actions">
                  <button className="btn btn-primary" onClick={() => apply(m.items)}>Apply this plan</button>
                </div>
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
          disabled={busy || disabled}
          aria-label="Chat with AI"
        />
        <div className="chat-input-buttons">
          <button
            className="btn btn-primary"
            onClick={send}
            disabled={busy || disabled || !instruction.trim()}
          >
            Send
          </button>
          <button
            className="btn"
            onClick={startOver}
            disabled={busy || disabled}
            title="Build a brand-new plan from your profile and the destination"
          >
            Generate a new plan
          </button>
        </div>
      </div>

      {disabled && <p className="muted small">Pick a date to use AI assist.</p>}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function greetId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function matchedName(destination) {
  return matchCity(destination)?.name || null
}

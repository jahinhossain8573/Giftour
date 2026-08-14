// AI assist panel.
//
// After the user finishes trip setup, the parent auto-runs "generate" once
// and applies the result. This panel then offers one-tap modification chips
// and a free-text instruction to refine the day without starting over.
//
// The mock LLM in lib/llm.js accepts a `modifiers` array (strings the user
// picked) and a `instruction` string. In production these would be passed
// to the real LLM as natural-language additions to the system prompt.

import { useState } from 'react'
import { organiseItinerary, generateItinerary } from '../lib/llm.js'

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

export default function AiPanel({ date, items, profile, preferences, trip, onApply, disabled }) {
  const [busy, setBusy] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState([]) // chip ids currently active
  const [instruction, setInstruction] = useState('')

  const toggleChip = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  const run = async (kind) => {
    setBusy(true); setError(null)
    try {
      const opts = {
        date,
        items,
        profile,
        preferences,
        modifiers: selected,
        instruction: instruction.trim(),
        trip,
      }
      const result = kind === 'organise'
        ? await organiseItinerary(opts)
        : await generateItinerary(opts)
      setLastResult({ kind, ...result })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  const apply = () => {
    if (!lastResult) return
    onApply(lastResult.items)
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

      <label className="ai-instruction">
        <span className="muted small">Or tell the AI what to change</span>
        <textarea
          className="text-input"
          rows={2}
          placeholder="e.g. skip loud places, swap the museum for a garden, finish by 4pm…"
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
        />
      </label>

      <div className="ai-buttons">
        <button className="btn" onClick={() => run('generate')} disabled={busy || disabled}>
          {busy ? 'Thinking…' : 'Generate a new plan'}
        </button>
        <button
          className="btn"
          onClick={() => run('organise')}
          disabled={busy || disabled || items.length === 0}
          title={items.length === 0 ? 'Add at least one activity first' : ''}
        >
          {busy ? 'Thinking…' : 'Re-organise my day'}
        </button>
      </div>

      {disabled && <p className="muted small">Pick a date to use AI assist.</p>}
      {error && <p className="error">{error}</p>}

      {lastResult && (
        <div className="ai-result">
          <p className="muted small">{lastResult.notes}</p>
          <div className="ai-result-actions">
            <button className="btn btn-primary" onClick={apply}>
              Apply this plan
            </button>
            <button className="btn btn-ghost small" onClick={() => setLastResult(null)}>
              Discard
            </button>
          </div>
          <ul className="ai-reason-list">
            {lastResult.items.map((it, i) => (
              <li key={it.id || i} className="ai-reason">
                <span className="ai-reason-dot" /> {it.reasoning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

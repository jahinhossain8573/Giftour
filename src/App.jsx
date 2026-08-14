import { useEffect, useMemo, useState } from 'react'
import './styles.css'
import OnboardingQuiz from './components/OnboardingQuiz.jsx'
import Calendar from './components/Calendar.jsx'
import ItineraryEditor from './components/ItineraryEditor.jsx'
import SensoryBudget from './components/SensoryBudget.jsx'
import AiPanel from './components/AiPanel.jsx'
import TripSetup from './components/TripSetup.jsx'
import { loadState, saveState, clearState } from './lib/storage.js'
import { applyFeedback } from './lib/profile.js'
import { generateItinerary } from './lib/llm.js'

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function EmptyState() {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state-arrow" aria-hidden="true">←</div>
      <h2>Select a date to start your tour</h2>
      <p className="muted">
        Tap any day on the calendar on the left. You can plan one day at a time,
        or use <strong>Generate from scratch</strong> once you've picked a day.
      </p>
      <ol className="empty-state-steps muted small">
        <li>Pick a day on the calendar</li>
        <li>Tell us where you're going and how long</li>
        <li>Add activities, or let AI build a day for you</li>
      </ol>
    </div>
  )
}

function durationLabel(d) {
  return {
    short: 'A few hours',
    half: 'Half day',
    full: 'Full day',
    overnight: 'Overnight',
  }[d] || d
}

export default function App() {
  const [state, setState] = useState(() => loadState())
  // No date selected until the user picks one — triggers the empty state.
  const [selected, setSelected] = useState(null)
  const [quizOpen, setQuizOpen] = useState(false)

  useEffect(() => { saveState(state) }, [state])

  // Derived: today's itinerary (or empty if none).
  const items = state.itineraries[selected] || []

  // Derived: profile after applying feedback. Updates whenever the log changes.
  const refinedProfile = useMemo(
    () => applyFeedback(state.profile, state.feedbackLog),
    [state.profile, state.feedbackLog]
  )

  // Persist refined tolerances back into the profile so they accumulate.
  useEffect(() => {
    if (!state.profile || !refinedProfile) return
    if (typeof refinedProfile.tolerance !== 'number') return
    if (refinedProfile.tolerance !== state.profile.tolerance) {
      setState(s => ({ ...s, profile: { ...s.profile, ...refinedProfile } }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refinedProfile.tolerance])

  const onComplete = (profile) => {
    setState(s => ({ ...s, profile, quizDone: true }))
    setQuizOpen(false)
  }

  const setItems = (newItems) => {
    setState(s => ({ ...s, itineraries: { ...s.itineraries, [selected]: newItems } }))
  }

  // Per-date trip metadata (destination, duration, notes).
  const trip = selected ? state.trips?.[selected] : null

  // When the user first finishes trip setup, ask the AI to draft a plan
  // and apply it automatically. We track this with a flag so a re-render
  // (e.g. from feedback) doesn't re-trigger the auto-generate.
  const [autoGenFor, setAutoGenFor] = useState(null)
  useEffect(() => {
    if (!trip || !selected) return
    if (autoGenFor === selected) return
    // Only auto-generate if the day is currently empty — don't blow away edits.
    const existing = state.itineraries[selected] || []
    if (existing.length > 0) return
    let cancelled = false
    ;(async () => {
      try {
        const result = await generateItinerary({
          date: selected, profile: state.profile, preferences, trip,
        })
        if (cancelled) return
        setItems(result.items)
      } catch (e) { /* surfaced in the AI panel */ }
      setAutoGenFor(selected)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip, selected])

  const saveTrip = (meta) => {
    setState(s => ({ ...s, trips: { ...(s.trips || {}), [selected]: meta } }))
    setAutoGenFor(null) // allow the next effect run to re-generate
  }

  const logFeedback = (entry) => {
    setState(s => ({ ...s, feedbackLog: [...s.feedbackLog, { ...entry, at: new Date().toISOString() }] }))
  }

  const preferences = useMemo(() => {
    // Infer "disliked" categories from the feedback log. A category counts as
    // disliked if more than half the entries for activities in that category
    // were marked overwhelming.
    const counts = {}
    const over = {}
    for (const f of state.feedbackLog) {
      const a = f.activityId
      counts[a] = (counts[a] || 0) + 1
      if (f.comfort < 0) over[a] = (over[a] || 0) + 1
    }
    return { disliked: Object.keys(over).filter(k => (over[k] / counts[k]) > 0.5) }
  }, [state.feedbackLog])

  // First run: no profile yet — show quiz, no skip.
  if (!state.profile || quizOpen) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Giftour</h1>
          <p className="tagline">Travel planning, tuned to you.</p>
        </header>
        <main className="container">
          <OnboardingQuiz onComplete={onComplete} />
          {state.profile && (
            <button className="btn btn-ghost" onClick={() => setQuizOpen(false)}>Cancel</button>
          )}
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Giftour</h1>
          <p className="tagline muted small">
            Hi, {state.profile.name}. Tolerance {state.profile.tolerance}/5.
            {' '}
            {state.feedbackLog.length > 0 && `Adjusted from ${state.feedbackLog.length} day${state.feedbackLog.length === 1 ? '' : 's'} of feedback.`}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={() => setQuizOpen(true)}>Retake quiz</button>
          <button className="btn btn-ghost danger" onClick={() => {
            if (window.confirm('Reset everything?')) { clearState(); setState(loadState()) }
          }}>Reset</button>
        </div>
      </header>

      <main className="container layout">
        <aside className="sidebar">
          <Calendar
            selected={selected}
            onSelect={setSelected}
            itineraries={state.itineraries}
          />
          {selected && (
            <button className="btn btn-ghost small" style={{ marginTop: 8, width: '100%' }} onClick={() => setSelected(null)}>
              ← Back to overview
            </button>
          )}
        </aside>

        <section className="content">
          {!selected ? (
            <EmptyState />
          ) : !trip ? (
            <TripSetup
              date={selected}
              onSave={(meta) => { saveTrip(meta); /* keeps selected as-is */ }}
              onCancel={() => setSelected(null)}
            />
          ) : (
            <>
              <div className="trip-banner">
                <div>
                  <strong>{trip.destination}</strong>
                  <span className="muted"> · {durationLabel(trip.duration)}{trip.notes ? ` · ${trip.notes}` : ''}</span>
                </div>
                <button className="btn btn-ghost small" onClick={() => saveTrip(null)}>Edit trip</button>
              </div>
              <ItineraryEditor
                date={selected}
                items={items}
                profile={state.profile}
                onChange={setItems}
                onLogFeedback={logFeedback}
              />
              <SensoryBudget items={items} profile={state.profile} />
              <AiPanel
                date={selected}
                items={items}
                profile={state.profile}
                preferences={preferences}
                trip={trip}
                onApply={setItems}
              />
            </>
          )}
        </section>
      </main>
    </div>
  )
}

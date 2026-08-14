import { Component, useEffect, useMemo, useState } from 'react'
import './styles.css'
import RoleSelect from './components/RoleSelect.jsx'
import OnboardingQuiz from './components/OnboardingQuiz.jsx'
import Calendar from './components/Calendar.jsx'
import ItineraryEditor from './components/ItineraryEditor.jsx'
import SensoryBudget from './components/SensoryBudget.jsx'
import AiItineraryPage from './components/AiItineraryPage.jsx'
import CompanionView from './components/CompanionView.jsx'
import TripSetup from './components/TripSetup.jsx'
import { loadState, saveState, clearState, generateCompanionCode } from './lib/storage.js'
import { applyFeedback } from './lib/profile.js'
import { resolvePlaces } from './lib/places.js'

// ─── Error boundary ───────────────────────────────────────────────────

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('giftour: ErrorBoundary caught', error, info) }
  render() {
    if (this.state.error) {
      return (
        <section className="ai-page ai-page-error">
          <div className="ai-page-error-icon" aria-hidden="true">!</div>
          <h2>Something went wrong</h2>
          <p className="muted">{this.state.error.message}</p>
          <pre className="muted small" style={{ fontSize: '0.7rem', whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto', textAlign: 'left', background: '#f4f1ec', padding: 12, borderRadius: 8, maxWidth: '100%' }}>{this.state.error.stack}</pre>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </section>
      )
    }
    return this.props.children
  }
}

// ─── App ──────────────────────────────────────────────────────────────

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
  return { short: 'A few hours', half: 'Half day', full: 'Full day', overnight: 'Overnight' }[d] || d
}

export default function App() {
  // ─── State ────────────────────────────────────────────────────────────
  const [state, setState] = useState(() => loadState())
  const [selected, setSelected] = useState(null)
  const [quizOpen, setQuizOpen] = useState(false)

  const [places, setPlaces] = useState({ places: [], matched: null, source: null })
  const [placesLoading, setPlacesLoading] = useState(false)
  const [placesStarted, setPlacesStarted] = useState(null)

  // ─── Derived values ───────────────────────────────────────────────────
  const trip = selected ? state.trips?.[selected] : null
  const items = state.itineraries[selected] || []

  // ─── Side effects ─────────────────────────────────────────────────────
  useEffect(() => { saveState(state) }, [state])

  useEffect(() => {
    const dest = trip?.destination
    const name = state.profile?.name
    if (state.role === 'companion') {
      document.title = 'Giftour — Companion'
    } else if (dest && name) {
      document.title = `Giftour — ${dest}`
    } else if (name) {
      document.title = `Giftour — ${name}`
    } else {
      document.title = 'Giftour'
    }
  }, [state.role, trip?.destination, state.profile?.name])

  // Resolve places when the destination changes.
  useEffect(() => {
    if (!trip?.destination) {
      setPlaces({ places: [], matched: null, source: null })
      setPlacesStarted(null)
      return
    }
    let cancelled = false
    setPlacesLoading(true)
    setPlacesStarted(trip.destination)
    ;(async () => {
      try {
        const result = await resolvePlaces(trip.destination)
        if (!cancelled) setPlaces(result)
      } catch {
        if (!cancelled) setPlaces({ places: [], matched: null, source: null })
      } finally {
        if (!cancelled) setPlacesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [trip?.destination])

  const placesReady = !trip?.destination || (placesStarted === trip?.destination && !placesLoading)

  // Profile refinement.
  const refinedProfile = useMemo(
    () => applyFeedback(state.profile, state.feedbackLog),
    [state.profile, state.feedbackLog]
  )

  useEffect(() => {
    if (!state.profile || !refinedProfile) return
    if (typeof refinedProfile.tolerance !== 'number') return
    if (refinedProfile.tolerance !== state.profile.tolerance) {
      setState(s => ({ ...s, profile: { ...s.profile, ...refinedProfile } }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refinedProfile.tolerance])

  // Preferences from feedback log.
  const preferences = useMemo(() => {
    const counts = {}
    const over = {}
    for (const f of state.feedbackLog) {
      const a = f.activityId
      counts[a] = (counts[a] || 0) + 1
      if (f.comfort < 0) over[a] = (over[a] || 0) + 1
    }
    return { disliked: Object.keys(over).filter(k => (over[k] / counts[k]) > 0.5) }
  }, [state.feedbackLog])

  // ─── Callbacks ───────────────────────────────────────────────────────

  const onComplete = (profile) => {
    setState(s => ({ ...s, profile, quizDone: true }))
    setQuizOpen(false)
  }

  const setItems = (newItems) => {
    setState(s => ({ ...s, itineraries: { ...s.itineraries, [selected]: newItems } }))
  }

  const saveTrip = (meta) => {
    setState(s => ({ ...s, trips: { ...(s.trips || {}), [selected]: meta } }))
  }

  const onAiApply = (newItems) => {
    setItems(newItems)
  }

  const logFeedback = (entry) => {
    setState(s => ({ ...s, feedbackLog: [...s.feedbackLog, { ...entry, at: new Date().toISOString() }] }))
  }

  // ─── Early returns ───────────────────────────────────────────────────

  if (!state.role) {
    return (
      <div className="app">
        <RoleSelect
          onRole={(role, code) => {
            setState(s => ({
              ...s,
              role,
              companionLink: role === 'companion' ? (code || null) : null,
            }))
          }}
        />
      </div>
    )
  }

  if (state.role === 'companion') {
    return (
      <CompanionView
        code={state.companionLink}
        onDisconnect={() => setState(s => ({ ...s, role: null, companionLink: null }))}
      />
    )
  }

  if (!state.profile || quizOpen) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Giftour</h1>
          <p className="tagline">Travel planning, tuned to you.</p>
        </header>
        <main className="container">
          <OnboardingQuiz onComplete={onComplete} onCancel={state.profile ? () => setQuizOpen(false) : undefined} />
        </main>
      </div>
    )
  }

  // ─── Main traveller layout ───────────────────────────────────────────

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Giftour</h1>
          <p className="tagline muted small">
            Hi, {state.profile.name}. Tolerance {state.profile.tolerance}/5.
            {' '}
            {state.feedbackLog.length > 0 && `Adjusted from ${state.feedbackLog.length} day${state.feedbackLog.length === 1 ? '' : 's'} of feedback.`}
            {state.companionCode && (
              <span> · Companion Code: {state.companionCode}</span>
            )}
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
            trips={state.trips}
          />
          {selected && (
            <button className="btn btn-ghost small" style={{ marginTop: 8, width: '100%' }} onClick={() => setSelected(null)}>
              ← Back to overview
            </button>
          )}
        </aside>

        <section className="content">
          <ErrorBoundary>
          {!selected ? (
            <EmptyState />
          ) : !trip ? (
            <TripSetup
              date={selected}
              onSave={(meta) => { saveTrip(meta) }}
              onCancel={() => setSelected(null)}
            />
          ) : items.length === 0 ? (
            !placesReady ? (
              <section className="ai-page ai-page-loading" role="status">
                <div className="ai-page-skeleton">
                  <div className="skeleton skeleton-title" />
                  <div className="skeleton skeleton-line" />
                  <div className="skeleton skeleton-line short" />
                </div>
                <p className="muted small">Looking up places in {trip.destination}…</p>
              </section>
            ) : (
              <AiItineraryPage
                date={selected}
                profile={state.profile}
                preferences={preferences}
                trip={trip}
                places={places.places}
                onApply={onAiApply}
                onStartOver={() => saveTrip(null)}
                onBack={() => saveTrip(null)}
                companionCode={state.companionCode}
              />
            )
          ) : (
            <>
              <div className="trip-banner">
                <div>
                  <strong>{trip.destination}</strong>
                  <span className="muted"> · {durationLabel(trip.duration)}{trip.notes ? ` · ${trip.notes}` : ''}</span>
                  {places.matched && places.source === 'google' && (
                    <span className="muted small"> · using Google Maps data</span>
                  )}
                  {places.matched && places.source === 'static' && (
                    <span className="muted small"> · using curated {places.matched} landmarks</span>
                  )}
                  {(!places.matched || places.source === 'generic') && (
                    <span className="muted small"> · no curated landmarks for this city — using default calm picks</span>
                  )}
                </div>
                <button className="btn btn-ghost small" onClick={() => saveTrip(null)}>Edit trip</button>
              </div>
              <ItineraryEditor
                date={selected}
                items={items}
                profile={state.profile}
                places={places.places}
                onChange={setItems}
                onLogFeedback={logFeedback}
              />
              <SensoryBudget items={items} profile={state.profile} places={places.places} />
              {state.profile?.independence === 'dependent' && (
                <div className="companion-code-card">
                  <span className="companion-code-label muted small">Companion Code</span>
                  {state.companionCode ? (
                    <>
                      <span className="companion-code-value">{state.companionCode}</span>
                      <button className="btn btn-ghost small" onClick={() => navigator.clipboard.writeText(state.companionCode)}>
                        Copy
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-primary small"
                      onClick={() => setState(s => ({ ...s, companionCode: generateCompanionCode() }))}
                    >
                      Generate companion code
                    </button>
                  )}
                </div>
              )}
            </>
          )}
          </ErrorBoundary>
        </section>
      </main>
    </div>
  )
}
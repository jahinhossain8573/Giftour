import { useState } from 'react'

// Multi-step quiz. Each step captures one thing; the result is a profile
// with a tolerance score, per-axis tolerances, interests, pace, and rest
// preference. Designed to be skippable — every question has a "prefer not
// to say" default that biases toward the middle.

const STEPS = [
  { id: 'name', title: 'Welcome', body: 'What should we call you?', kind: 'text' },
  { id: 'noise', title: 'Sound', body: 'How do you feel about noisy environments?', kind: 'scale', axis: 'noise' },
  { id: 'crowds', title: 'Crowds', body: 'How do you feel about crowded places?', kind: 'scale', axis: 'crowds' },
  { id: 'light', title: 'Light', body: 'How do you feel about bright or flickering lights?', kind: 'scale', axis: 'light' },
  { id: 'unpredictability', title: 'Surprises', body: 'How do you feel about unexpected changes in plans?', kind: 'scale', axis: 'unpredictability' },
  { id: 'pace', title: 'Pace', body: 'What pace works for you on a travel day?', kind: 'choice', options: [
    { value: 'slow', label: 'Slow — one main thing, lots of rest' },
    { value: 'balanced', label: 'Balanced — two or three things' },
    { value: 'packed', label: 'Packed — fit it all in' },
  ] },
  { id: 'interests', title: 'Interests', body: 'Pick anything that sounds good.', kind: 'multi', options: [
    { value: 'culture', label: 'Museums & galleries' },
    { value: 'outdoors', label: 'Parks & trails' },
    { value: 'food', label: 'Food & cafés' },
    { value: 'event', label: 'Events & shows' },
    { value: 'rest', label: 'Quiet recovery' },
  ] },
  { id: 'rest', title: 'Rest', body: 'Between activities, do you prefer scheduled breaks or open space?', kind: 'choice', options: [
    { value: 'scheduled', label: 'Scheduled breaks built into the day' },
    { value: 'open', label: 'Open time, I\'ll decide' },
  ] },
  { id: 'independence', title: 'Travel Style', body: 'Do you prefer exploring on your own or going with a guide?', kind: 'choice', options: [
    { value: 'independent', label: 'Independent' },
    { value: 'dependent', label: 'Dependent' },
  ] },
]

const SCALE_LABELS = ['Very difficult', 'Difficult', 'Manageable', 'Comfortable', 'Very comfortable']

export default function OnboardingQuiz({ onComplete, onCancel }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const current = STEPS[step]
  const progress = ((step + 1) / STEPS.length) * 100

  const update = (key, value) => setAnswers(a => ({ ...a, [key]: value }))

  const advance = () => {
    if (step === STEPS.length - 1) {
      // Build the profile.
      const tolerances = {
        noise: answers.noise ?? 3,
        crowds: answers.crowds ?? 3,
        light: answers.light ?? 3,
        unpredictability: answers.unpredictability ?? 3,
      }
      const tolerance = Math.round(
        (tolerances.noise + tolerances.crowds + tolerances.light + tolerances.unpredictability) / 4
      )
      onComplete({
        name: answers.name?.trim() || 'Traveller',
        tolerance,
        tolerances,
        pace: answers.pace || 'balanced',
        interests: answers.interests || [],
        rest: answers.rest || 'scheduled',
        independence: answers.independence || 'independent',
      })
      return
    }
    setStep(step + 1)
  }

  const back = () => step > 0 && setStep(step - 1)
  const canAdvance = current.kind === 'text' || current.kind === 'scale' || current.kind === 'multi'
    || answers[current.id] !== undefined

  return (
    <div className="quiz">
      <div className="quiz-progress" aria-hidden="true">
        <div className="quiz-progress-bar" style={{ width: `${progress}%` }} />
      </div>
      <p className="quiz-step">Step {step + 1} of {STEPS.length}</p>
      <h2>{current.title}</h2>
      <p className="quiz-body">{current.body}</p>

      {current.kind === 'text' && (
        <input
          className="quiz-text-input"
          type="text"
          value={answers.name || ''}
          onChange={e => update('name', e.target.value)}
          placeholder="Your name or nickname"
          autoFocus
        />
      )}

      {current.kind === 'scale' && (
        <div className="quiz-scale" role="radiogroup" aria-label={current.title}>
          {SCALE_LABELS.map((label, i) => {
            const value = i + 1
            return (
              <button
                key={value}
                role="radio"
                aria-checked={answers[current.axis] === value}
                className={`quiz-scale-btn ${answers[current.axis] === value ? 'selected' : ''}`}
                onClick={() => update(current.axis, value)}
              >
                <span className="quiz-scale-dot">{value}</span>
                <span className="quiz-scale-label">{label}</span>
              </button>
            )
          })}
        </div>
      )}

      {current.kind === 'choice' && (
        <div className="quiz-choices">
          {current.options.map(opt => (
            <button
              key={opt.value}
              className={`quiz-choice ${answers[current.id] === opt.value ? 'selected' : ''}`}
              onClick={() => update(current.id, opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {current.kind === 'multi' && (
        <div className="quiz-multi">
          {current.options.map(opt => {
            const selected = (answers[current.id] || []).includes(opt.value)
            return (
              <button
                key={opt.value}
                className={`quiz-choice ${selected ? 'selected' : ''}`}
                onClick={() => {
                  const list = answers[current.id] || []
                  update(current.id, selected ? list.filter(v => v !== opt.value) : [...list, opt.value])
                }}
                aria-pressed={selected}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}

      <div className="quiz-nav">
        <div>
          {step > 0 && <button className="btn btn-ghost" onClick={back}>Back</button>}
          {onCancel && <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
        </div>
        <button className="btn btn-primary" onClick={advance} disabled={!canAdvance}>
          {step === STEPS.length - 1 ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  )
}

// Role selection screen shown on first launch.
// Lets the user pick Traveller or Companion before anything else.

import { useState } from 'react'
import { generateCompanionCode, loadCompanionData } from '../lib/storage.js'

export default function RoleSelect({ onRole }) {
  const [mode, setMode] = useState(null) // null | 'traveller' | 'companion'
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

  const handleTraveller = () => {
    onRole('traveller')
  }

  const handleCompanion = () => {
    const clean = code.trim().toUpperCase()
    if (!clean) {
      setCodeError('Enter a companion code.')
      return
    }
    const data = loadCompanionData(clean)
    if (!data) {
      setCodeError('Code not found. Ask your traveller for their code.')
      return
    }
    onRole('companion', clean)
  }

  return (
    <div className="role-select">
      <div className="role-select-header">
        <h1>Giftour</h1>
        <p className="muted">Travel planning, tuned to you.</p>
      </div>
      <div className="role-select-cards">
        <button
          className={`role-card ${mode === 'traveller' ? 'selected' : ''}`}
          onClick={() => { setMode('traveller'); setCodeError('') }}
        >
          <span className="role-card-icon" aria-hidden="true">🧳</span>
          <strong>I'm a Traveller</strong>
          <span className="muted small">Plan your day, manage your sensory budget, get AI suggestions</span>
        </button>
        <button
          className={`role-card ${mode === 'companion' ? 'selected' : ''}`}
          onClick={() => { setMode('companion'); setCodeError('') }}
        >
          <span className="role-card-icon" aria-hidden="true">👁️</span>
          <strong>I'm a Companion</strong>
          <span className="muted small">Monitor a traveller's itinerary and help them stay on track</span>
        </button>
      </div>

      {mode === 'traveller' && (
        <div className="role-select-action">
          <button className="btn btn-primary" onClick={handleTraveller}>
            Start planning
          </button>
        </div>
      )}

      {mode === 'companion' && (
        <div className="role-select-action">
          <label className="trip-label" htmlFor="companion-code">
            Enter the traveller's companion code
            <input
              id="companion-code"
              className="text-input"
              type="text"
              placeholder="e.g. A3K9-M2P7"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              autoFocus
            />
          </label>
          {codeError && <p className="error">{codeError}</p>}
          <button className="btn btn-primary" onClick={handleCompanion}>
            Connect
          </button>
        </div>
      )}
    </div>
  )
}
// Month grid with a clear "selected date" affordance. A dot marks any date
// with a planned itinerary. Keyboard navigation with arrow keys is a TODO
// but the markup is set up so it's easy to add.

import { useMemo, useState } from 'react'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function pad(n) { return String(n).padStart(2, '0') }
function fmt(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}` }

export default function Calendar({ selected, onSelect, itineraries }) {
  const today = new Date()
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() })

  const grid = useMemo(() => {
    const first = new Date(view.year, view.month, 1)
    const startWeekday = (first.getDay() + 6) % 7  // Monday=0
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < startWeekday; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [view])

  const move = (delta) => {
    let m = view.month + delta
    let y = view.year
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setView({ year: y, month: m })
  }

  const isToday = (d) =>
    d && d === today.getDate() && view.month === today.getMonth() && view.year === today.getFullYear()

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button className="btn btn-ghost" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <h3 className="calendar-title">{MONTHS[view.month]} {view.year}</h3>
        <button className="btn btn-ghost" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>
      <div className="calendar-weekdays">
        {WEEKDAYS.map(d => <div key={d} className="calendar-weekday">{d}</div>)}
      </div>
      <div className="calendar-grid">
        {grid.map((d, i) => {
          if (!d) return <div key={i} className="calendar-cell empty" />
          const dateKey = fmt(view.year, view.month, d)
          const hasItinerary = (itineraries[dateKey] || []).length > 0
          const isSelected = selected === dateKey
          return (
            <button
              key={i}
              className={`calendar-cell ${isSelected ? 'selected' : ''} ${isToday(d) ? 'today' : ''}`}
              onClick={() => onSelect(dateKey)}
              aria-label={`${MONTHS[view.month]} ${d}, ${view.year}${hasItinerary ? ', has itinerary' : ''}`}
              aria-pressed={isSelected}
            >
              <span className="calendar-day">{d}</span>
              {hasItinerary && <span className="calendar-dot" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

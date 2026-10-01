import { useMemo } from 'react'
import { toLocalISODate } from '@shared/utils/date'
import useTouchLayout from '@design/theme/useTouchLayout'

const WEEKS_TO_SHOW = 12
const DAYS_TO_SHOW = WEEKS_TO_SHOW * 7
const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function bucket(count, maxCount) {
  if (count === 0) return 0
  const ratio = count / maxCount
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

const MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: 'short' })
const DAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

// On a touch screen the 14px cells are display-only — too small to tap, and a
// tooltip needs a pointer — and the same day-by-day detail is offered as text
// in "Read the calendar as a list" beneath them.
export default function HabitHeatmap({ habits, logsByHabit, id }) {
  const touch = useTouchLayout()
  const { days, weeks, maxCount, totalMarks, monthMarks } = useMemo(() => {
    const byDate = {}
    for (const habit of habits) {
      for (const date of logsByHabit[habit.id] ?? []) {
        if (!byDate[date]) byDate[date] = { count: 0, names: [] }
        byDate[date].count += 1
        byDate[date].names.push(habit.name)
      }
    }

    // Grid ends on the upcoming Saturday so full weeks always align to
    // Sun-start columns, contributions-graph style.
    const today = new Date()
    const end = new Date(today)
    end.setDate(today.getDate() + (6 - today.getDay()))
    const start = new Date(end)
    start.setDate(end.getDate() - DAYS_TO_SHOW + 1)

    const days = []
    for (let i = 0; i < DAYS_TO_SHOW; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const iso = toLocalISODate(d)
      const entry = byDate[iso]
      days.push({
        date: iso,
        day: d,
        count: entry?.count ?? 0,
        names: entry?.names ?? [],
        isFuture: d > today,
      })
    }

    const weeks = []
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

    // A month label prints above the first column that starts a new month,
    // so the strip reads as a calendar rather than an anonymous grid.
    let lastMonth = null
    const monthMarks = weeks.map((week) => {
      const month = week[0].day.getMonth()
      if (month === lastMonth) return ''
      lastMonth = month
      return MONTH_FMT.format(week[0].day)
    })

    return {
      days,
      weeks,
      maxCount: Math.max(1, ...days.map((d) => d.count)),
      totalMarks: days.reduce((sum, d) => sum + d.count, 0),
      monthMarks,
    }
  }, [habits, logsByHabit])

  if (habits.length === 0) return null

  return (
    <section className="panel" id={id}>
      <div className="panel-head">
        <span className="panel-head-num">§ 03</span>
        <h2>The calendar</h2>
        <span className="panel-head-note">{WEEKS_TO_SHOW} weeks · {totalMarks} marks</span>
      </div>

      <div
        className="heat"
        data-static={touch ? 'true' : undefined}
        role="img"
        aria-label={`Habit completion calendar for the last ${WEEKS_TO_SHOW} weeks, ${totalMarks} marks in total`}
      >
        <div className="heat-days" aria-hidden="true">
          <span className="heat-day" />
          {DAY_LABELS.map((label, i) => (
            <span className="heat-day" key={i}>
              {i % 2 === 1 ? label : ''}
            </span>
          ))}
        </div>
        <div>
          <div className="heat-grid" aria-hidden="true">
            {monthMarks.map((label, i) => (
              <span className="heat-day heat-month" key={i}>
                {label}
              </span>
            ))}
          </div>
          <div className="heat-grid">
            {weeks.map((week, wi) => (
              <div className="heat-week" key={wi}>
                {week.map((day) => (
                  <div
                    key={day.date}
                    className="heat-cell"
                    data-level={day.isFuture ? undefined : bucket(day.count, maxCount)}
                    data-future={day.isFuture ? 'true' : undefined}
                    title={
                      day.isFuture || touch
                        ? undefined
                        : `${day.date}: ${day.count === 0 ? 'nothing logged' : day.names.join(', ')}`
                    }
                    tabIndex={day.isFuture ? -1 : touch ? undefined : 0}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {touch && (
        <details className="heat-list">
          <summary>Read the calendar as a list</summary>
          <ol>
            {days
              .filter((day) => !day.isFuture && day.count > 0)
              .reverse()
              .map((day) => (
                <li key={day.date}>
                  <span className="heat-list-date">{DAY_FMT.format(day.day)}</span>
                  <span>{day.names.join(', ')}</span>
                </li>
              ))}
          </ol>
          <p className="heat-list-note">Days not listed: nothing ticked.</p>
        </details>
      )}

      <div className="heat-legend">
        <span>Fewer</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className="heat-cell" data-level={level} />
        ))}
        <span>More</span>
      </div>
    </section>
  )
}

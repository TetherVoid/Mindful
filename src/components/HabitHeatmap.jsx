import { useMemo } from 'react'
import { toLocalISODate } from '../lib/date'

const WEEKS_TO_SHOW = 12
const DAYS_TO_SHOW = WEEKS_TO_SHOW * 7
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function bucket(count, maxCount) {
  if (count === 0) return 0
  const ratio = count / maxCount
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}

export default function HabitHeatmap({ habits, logsByHabit, id }) {
  const { weeks, maxCount } = useMemo(() => {
    const byDate = {}
    for (const habit of habits) {
      for (const date of logsByHabit[habit.id] ?? []) {
        if (!byDate[date]) byDate[date] = { count: 0, names: [] }
        byDate[date].count += 1
        byDate[date].names.push(habit.name)
      }
    }

    // Grid ends on the upcoming Saturday so full weeks always align to
    // Sun-start columns, GitHub-contributions style.
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
        count: entry?.count ?? 0,
        names: entry?.names ?? [],
        isFuture: d > today,
      })
    }

    const weeks = []
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))

    const maxCount = Math.max(1, ...days.map((d) => d.count))
    return { weeks, maxCount }
  }, [habits, logsByHabit])

  if (habits.length === 0) return null

  return (
    <div className="card" id={id}>
      <h2>Activity</h2>
      <div className="habit-heatmap" role="img" aria-label={`Habit completion heatmap, last ${WEEKS_TO_SHOW} weeks`}>
        <div className="habit-heatmap-day-labels">
          {DAY_LABELS.map((label, i) => (
            <span key={label} className="habit-heatmap-day-label">
              {i % 2 === 1 ? label.slice(0, 1) : ''}
            </span>
          ))}
        </div>
        <div className="habit-heatmap-grid">
          {weeks.map((week, wi) => (
            <div className="habit-heatmap-week" key={wi}>
              {week.map((day) => (
                <div
                  key={day.date}
                  className="habit-heatmap-cell"
                  data-level={day.isFuture ? undefined : bucket(day.count, maxCount)}
                  data-future={day.isFuture ? 'true' : undefined}
                  title={day.isFuture ? undefined : `${day.date}: ${day.count === 0 ? 'nothing logged' : day.names.join(', ')}`}
                  tabIndex={day.isFuture ? -1 : 0}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="habit-heatmap-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className="habit-heatmap-cell" data-level={level} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

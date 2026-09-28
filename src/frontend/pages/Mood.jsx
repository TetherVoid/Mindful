import { useEffect, useRef, useState } from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
} from 'recharts'
import { listRecentMoodsChronological, createMood, countMoods } from '@backend/services/moods'
import { useAuth } from '@backend/auth/AuthContext'
import useLiveAccentColor from '@design/theme/useLiveAccentColor'
import { getMoodHistoryLength } from '@shared/utils/preferences'
import { toLocalISODate, todayISO } from '@shared/utils/date'
import FormSuccess from '@frontend/components/FormSuccess'
import FormError from '@frontend/components/FormError'
import MarginNote from '@frontend/components/MarginNote'
import { loadInsights } from '@backend/services/report/data'
import { weekdayStrip } from '@backend/services/report/observations'
import Reveal from '@design/primitives/Reveal'
import Icon, { MoodFace } from '@design/primitives/Icon'
import CharCount from '@design/primitives/CharCount'
import { TEXT_LIMITS } from '@shared/constants/limits'

const MOODS = [
  { score: 1, label: 'Awful' },
  { score: 2, label: 'Low' },
  { score: 3, label: 'Even' },
  { score: 4, label: 'Good' },
  { score: 5, label: 'Bright' },
]

const BRUSH_THRESHOLD = 14

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const mood = MOODS.find((m) => m.score === payload[0].value)
  return (
    <div className="chart-tooltip">
      <b>{label}</b>
      {mood?.label}
    </div>
  )
}

// Mean of the visible run, printed as a single figure — the almanac's
// summary line for the chart underneath it.
function average(values) {
  if (!values.length) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// The average DAY, not the average entry. A mood can change within a day and
// can be logged more than once; five marks on one bad day should count as one
// bad day, not five. Same rule as backend/services/report/insights.js.
function averageOfDays(logs) {
  const byDay = new Map()
  for (const log of logs) {
    const day = toLocalISODate(new Date(log.created_at))
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(log.mood_score)
  }
  return average([...byDay.values()].map(average))
}

export default function Mood() {
  const { user } = useAuth()
  const accent = useLiveAccentColor()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  // Nothing is chosen until the reader chooses. A preset middle score would be
  // recorded by anyone who pressed the button without picking, and would pull
  // every average toward "Even".
  const [score, setScore] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  // The state above drives the button; this ref is the actual guard. Two
  // submits dispatched before React re-renders would both read the old state.
  const submittingRef = useRef(false)
  const [note, setNote] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [selectedLog, setSelectedLog] = useState(null)
  // The weekday strip reads the same half-year window as the reading, not the
  // chart's shorter one, so a weekday average means the same thing on both.
  const [week, setWeek] = useState(null)
  // Every entry on file, not just the chart's window — the same total the
  // day sheet and the reading work from.
  const [totalMoods, setTotalMoods] = useState(null)

  const historyLength = getMoodHistoryLength()

  async function loadWeek() {
    const { data } = await loadInsights()
    if (!data) return
    const strip = weekdayStrip(data)
    setWeek({ ...strip, bright: data.mood.brightest?.day ?? null })
  }

  async function loadLogs() {
    setLoading(true)
    setError(null)
    // Read here rather than closing over historyLength, so the mount effect
    // below depends on nothing reactive and stays a run-once load.
    const [{ data, error: loadError }, counted] = await Promise.all([
      listRecentMoodsChronological(getMoodHistoryLength()),
      countMoods(),
    ])

    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }

    setLogs(data ?? [])
    setTotalMoods(counted.count ?? (data ?? []).length)
    setLoading(false)
  }

  useEffect(() => {
    loadLogs()
    loadWeek()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    // The in-flight guard: a quick double press would otherwise insert the
    // same mark twice before the first request came back.
    if (score == null || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError(null)
    const { data, error: insertError } = await createMood({
      userId: user.id,
      moodScore: score,
      note,
    })
    submittingRef.current = false
    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setLogs((prev) => [...prev, data].slice(-historyLength))
    setTotalMoods((t) => (t == null ? t : t + 1))
    setNote('')
    // Cleared so the next mark is a fresh choice, not a repeat of this one.
    setScore(null)
    loadWeek()
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 2500)
  }

  const chartData = logs.map((l) => ({
    id: l.id,
    date: new Date(l.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    mood: l.mood_score,
    note: l.note,
  }))

  const mean = averageOfDays(logs)

  // Today's marks so far, if any, so the page can say so instead of letting a
  // second mark look like a mistake.
  const today = todayISO()
  const todaysLogs = logs.filter((l) => toLocalISODate(new Date(l.created_at)) === today)
  const lastToday = todaysLogs[todaysLogs.length - 1]

  function renderDot(props) {
    const { key, cx, cy, payload } = props
    return (
      <rect
        key={key}
        x={cx - 3}
        y={cy - 3}
        width={6}
        height={6}
        fill={accent}
        style={{ cursor: 'pointer' }}
        onClick={() => setSelectedLog(payload)}
      />
    )
  }

  return (
    <div className="folio">
      <Reveal as="header" className="folio-head" y={14} index={0}>
        <div>
          <p className="folio-kicker">Section 02</p>
          <h1 className="folio-title">
            How it's <em>going</em>
          </h1>
          <p className="folio-standfirst">
            One mark a day is enough. The line underneath does the remembering for you.
          </p>
        </div>
        <div className="folio-meta">
          <span>
            <b>{totalMoods ?? logs.length}</b> {(totalMoods ?? logs.length) === 1 ? 'entry' : 'entries'} in all
          </span>
          {mean !== null && (
            <span>
              Average day <b>{mean.toFixed(1)}</b> / 5 · last {logs.length}
            </span>
          )}
        </div>
      </Reveal>

      <FormError message={error} label="Mood" />

      <Reveal as="form" className="panel" index={1} onSubmit={handleSubmit}>
        <div className="panel-head">
          <span className="panel-head-num">§ 01</span>
          <h2>Today's mark</h2>
          <span className="panel-head-note">Takes five seconds</span>
        </div>

        <div className="gauge" role="radiogroup" aria-label="Mood score">
          {MOODS.map((m) => (
            <button
              type="button"
              key={m.score}
              className={`gauge-step ${score === m.score ? 'selected' : ''}`}
              onClick={() => setScore(m.score)}
              role="radio"
              aria-checked={score === m.score}
            >
              <MoodFace score={m.score} size={30} className="gauge-face" />
              <span className="gauge-label">{m.label}</span>
              <span className="gauge-score" aria-hidden="true">
                {m.score}/5
              </span>
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="mood-note">
            <span className="field-num">01</span> Anything worth noting
          </label>
          <textarea
            id="mood-note"
            placeholder="Optional. A sentence is plenty."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={TEXT_LIMITS.moodNote}
            rows={3}
          />
          <CharCount value={note} max={TEXT_LIMITS.moodNote} />
        </div>

        {lastToday && (
          <p className="panel-note">
            Already marked today — {MOODS.find((m) => m.score === lastToday.mood_score)?.label},{' '}
            {new Date(lastToday.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.
            Add another if the day has changed; the figures use the day&rsquo;s average.
          </p>
        )}

        <button
          type="submit"
          className="btn btn--solid"
          disabled={score == null || submitting}
          aria-describedby={score == null ? 'mood-pick-hint' : undefined}
        >
          <Icon name="plus" size={15} />
          {submitting ? 'Logging…' : 'Log this mood'}
        </button>
        {score == null && (
          <p className="panel-note" id="mood-pick-hint">
            Pick one of the five marks first.
          </p>
        )}
        <FormSuccess visible={showSuccess} message="Today's mark is on the page." />
      </Reveal>

      <Reveal as="section" className="panel" index={2}>
        <div className="panel-head">
          <span className="panel-head-num">§ 02</span>
          <h2>The trend line</h2>
          <span className="panel-head-note">Last {historyLength}</span>
        </div>

        {loading ? (
          <div className="ruled-skeleton ruled-skeleton--chart" />
        ) : chartData.length === 0 ? (
          <p className="empty-state">Nothing plotted yet — log your first mood above.</p>
        ) : (
          <>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="moodFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--rule)" tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis
                    domain={[1, 5]}
                    ticks={[1, 2, 3, 4, 5]}
                    stroke="var(--rule)"
                    tickLine={false}
                    tick={{ fontSize: 10 }}
                    width={26}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--rule)' }} />
                  <Area type="linear" dataKey="mood" stroke="none" fill="url(#moodFill)" />
                  <Line
                    type="linear"
                    dataKey="mood"
                    stroke={accent}
                    strokeWidth={1.5}
                    dot={renderDot}
                    activeDot={{ r: 5, onClick: (_e, item) => setSelectedLog(item.payload) }}
                  />
                  {chartData.length > BRUSH_THRESHOLD && (
                    <Brush
                      dataKey="date"
                      height={22}
                      stroke={accent}
                      fill="transparent"
                      travellerWidth={8}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {selectedLog ? (
              <p className="chart-annotation">
                <strong>{selectedLog.date}</strong>
                {selectedLog.note || 'No note was written for this entry.'}
                <button
                  type="button"
                  className="chart-annotation-dismiss"
                  onClick={() => setSelectedLog(null)}
                  aria-label="Dismiss note"
                >
                  <Icon name="close" size={13} />
                </button>
              </p>
            ) : (
              <div className="heat-legend">
                <span>Select any point to read its note</span>
              </div>
            )}
          </>
        )}
      </Reveal>

      {week && week.cells.some((c) => c.count > 0) && (
        <Reveal as="section" className="panel" index={3}>
          <div className="panel-head">
            <span className="panel-head-num">§ 03</span>
            <h2>The week</h2>
            <span className="panel-head-note">Average day, by weekday</span>
          </div>
          <div className="week-strip" role="list" aria-label="Average mood by weekday">
            {week.cells.map((c) => (
              <div
                role="listitem"
                key={c.day}
                className={`week-cell ${week.note.kind === 'weekday' && week.bright === c.day ? 'week-cell--bright' : ''}`}
                aria-label={
                  c.mean == null
                    ? `${c.day}: ${c.count} ${c.count === 1 ? 'day' : 'days'} logged, not enough for an average yet`
                    : `${c.day}: average ${c.mean} out of 5, over ${c.count} days`
                }
              >
                <span className="week-cell-day">{c.short}</span>
                <span className="week-cell-mean">{c.mean == null ? '—' : c.mean.toFixed(1)}</span>
                <span className="week-cell-count">{c.count}d</span>
              </div>
            ))}
          </div>
          <MarginNote observation={week.note} kicker="Across the week" />
        </Reveal>
      )}
    </div>
  )
}

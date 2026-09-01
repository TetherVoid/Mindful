import { useEffect, useState } from 'react'
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
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import useLiveAccentColor from '../hooks/useLiveAccentColor'
import { getMoodHistoryLength } from '../lib/preferences'
import FormSuccess from '../components/FormSuccess'
import FormError from '../components/FormError'
import Reveal from '../components/Reveal'
import Icon, { MoodFace } from '../components/Icon'

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

export default function Mood() {
  const { user } = useAuth()
  const accent = useLiveAccentColor()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [score, setScore] = useState(3)
  const [note, setNote] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [selectedLog, setSelectedLog] = useState(null)

  const historyLength = getMoodHistoryLength()

  async function loadLogs() {
    setLoading(true)
    setError(null)
    // Most recent N, newest first — then reverse to chronological order for
    // the chart. Ordering ascending-with-limit here would instead fetch the
    // N OLDEST entries and get permanently stuck once a user passes N logs.
    const { data, error: loadError } = await supabase
      .from('mood_logs')
      .select('id, mood_score, note, created_at')
      .order('created_at', { ascending: false })
      .limit(historyLength)

    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }

    setLogs((data ?? []).slice().reverse())
    setLoading(false)
  }

  useEffect(() => {
    loadLogs()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const { data, error: insertError } = await supabase
      .from('mood_logs')
      .insert({ user_id: user.id, mood_score: score, note })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setLogs((prev) => [...prev, data].slice(-historyLength))
    setNote('')
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 2500)
  }

  const chartData = logs.map((l) => ({
    id: l.id,
    date: new Date(l.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    mood: l.mood_score,
    note: l.note,
  }))

  const mean = average(logs.map((l) => l.mood_score))

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
            <b>{logs.length}</b> entries held
          </span>
          {mean !== null && (
            <span>
              Mean <b>{mean.toFixed(1)}</b> / 5
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
            rows={3}
          />
        </div>

        <button type="submit" className="btn btn--solid">
          <Icon name="plus" size={15} />
          Log this mood
        </button>
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
    </div>
  )
}

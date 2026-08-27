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
import Reveal from '../components/Reveal'

const MOODS = [
  { score: 1, emoji: '😞', label: 'Awful' },
  { score: 2, emoji: '🙁', label: 'Low' },
  { score: 3, emoji: '😐', label: 'Okay' },
  { score: 4, emoji: '🙂', label: 'Good' },
  { score: 5, emoji: '😄', label: 'Great' },
]

const BRUSH_THRESHOLD = 14

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const mood = MOODS.find((m) => m.score === payload[0].value)
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      <div>
        {mood?.emoji} {mood?.label}
      </div>
    </div>
  )
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

  function renderDot(props) {
    const { key, cx, cy, payload } = props
    return (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        r={3}
        fill={accent}
        style={{ cursor: 'pointer' }}
        onClick={() => setSelectedLog(payload)}
      />
    )
  }

  return (
    <div className="page">
      <h1>Mood</h1>

      {error && <div className="form-error">{error}</div>}

      <Reveal as="form" className="card mood-form" onSubmit={handleSubmit}>
        <p>How are you feeling right now?</p>
        <div className="mood-picker" role="radiogroup" aria-label="Mood score">
          {MOODS.map((m) => (
            <button
              type="button"
              key={m.score}
              className={`mood-option ${score === m.score ? 'selected' : ''}`}
              onClick={() => setScore(m.score)}
              role="radio"
              aria-checked={score === m.score}
              aria-label={m.label}
            >
              <span aria-hidden="true">{m.emoji}</span>
            </button>
          ))}
        </div>
        <textarea
          placeholder="Anything on your mind? (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
        <button type="submit" className="btn-primary">
          Log mood
        </button>
        <FormSuccess visible={showSuccess} message="Mood logged." />
      </Reveal>

      <Reveal className="card" delay={0.1}>
        <h2>Trend</h2>
        {loading ? (
          <div className="skeleton skeleton-chart" />
        ) : chartData.length === 0 ? (
          <p className="empty-state">No entries yet — log your first mood above.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--muted)" tick={{ fontSize: 12 }} />
                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} stroke="var(--muted)" tick={{ fontSize: 12 }} width={24} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="mood" stroke="none" fill="url(#moodGradient)" />
                <Line
                  type="monotone"
                  dataKey="mood"
                  stroke={accent}
                  strokeWidth={2}
                  dot={renderDot}
                  activeDot={{ r: 5, onClick: (_e, item) => setSelectedLog(item.payload) }}
                />
                {chartData.length > BRUSH_THRESHOLD && (
                  <Brush dataKey="date" height={22} stroke={accent} travellerWidth={8} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
            {selectedLog && (
              <p className="chart-selected-note">
                <strong>{selectedLog.date}:</strong>{' '}
                {selectedLog.note || 'No note for this entry.'}{' '}
                <button type="button" className="chart-selected-dismiss" onClick={() => setSelectedLog(null)}>
                  ×
                </button>
              </p>
            )}
          </>
        )}
      </Reveal>
    </div>
  )
}

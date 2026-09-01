import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import useLiveAccentColor from '../hooks/useLiveAccentColor'
import Reveal from '../components/Reveal'
import { StaggerGroup, StaggerItem } from '../components/Stagger'
import Icon, { MoodFace } from '../components/Icon'

const MOOD_LABELS = { 1: 'Awful', 2: 'Low', 3: 'Even', 4: 'Good', 5: 'Bright' }
const MOOD_SCORES = [1, 2, 3, 4, 5]
const DISTRIBUTION_SAMPLE_SIZE = 90

function greetingForHour(hour) {
  if (hour < 5) return 'Late night'
  if (hour < 12) return 'Morning'
  if (hour < 18) return 'Afternoon'
  return 'Evening'
}

function DistributionTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { score, count } = payload[0].payload
  return (
    <div className="chart-tooltip">
      <b>{MOOD_LABELS[score]}</b>
      {count} {count === 1 ? 'entry' : 'entries'}
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const accent = useLiveAccentColor()
  const firstName = user?.email?.split('@')[0]
  const [loading, setLoading] = useState(true)
  const [recentMoods, setRecentMoods] = useState([])
  const [habitCount, setHabitCount] = useState(0)
  const [recentThoughts, setRecentThoughts] = useState([])
  const [thoughtCount, setThoughtCount] = useState(0)
  const [moodDistribution, setMoodDistribution] = useState([])

  useEffect(() => {
    async function load() {
      const [
        { data: moods },
        { count },
        { data: thoughts, count: thoughtTotal },
        { data: distributionRows },
      ] = await Promise.all([
        supabase
          .from('mood_logs')
          .select('mood_score, created_at')
          .order('created_at', { ascending: false })
          .limit(7),
        supabase.from('habits').select('id', { count: 'exact', head: true }).eq('archived', false),
        supabase
          .from('thought_records')
          .select('id, situation, created_at', { count: 'exact' })
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('mood_logs')
          .select('mood_score')
          .order('created_at', { ascending: false })
          .limit(DISTRIBUTION_SAMPLE_SIZE),
      ])
      setRecentMoods(moods ?? [])
      setHabitCount(count ?? 0)
      setRecentThoughts(thoughts ?? [])
      setThoughtCount(thoughtTotal ?? 0)

      const counts = Object.fromEntries(MOOD_SCORES.map((s) => [s, 0]))
      for (const row of distributionRows ?? []) counts[row.mood_score] += 1
      setMoodDistribution(
        MOOD_SCORES.map((score) => ({ score, label: MOOD_LABELS[score], count: counts[score] }))
      )

      setLoading(false)
    }
    load()
  }, [])

  const today = new Date()
  const greeting = greetingForHour(today.getHours())
  const dateLine = today.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })

  // Day one: nothing has been written yet, so the page can't describe a
  // history. It introduces the book and points at the one action worth
  // taking first, rather than listing three kinds of emptiness.
  const isNewBook =
    !loading && recentMoods.length === 0 && habitCount === 0 && thoughtCount === 0

  const header = (
    <Reveal as="header" className="folio-head" y={14} index={0}>
      <div>
        <p className="folio-kicker">
          {greeting}
          {firstName ? `, ${firstName}` : ''}
        </p>
        <h1 className="folio-title">
          {isNewBook ? (
            <>
              A blank <em>book</em>
            </>
          ) : (
            <>
              The day <em>sheet</em>
            </>
          )}
        </h1>
        <p className="folio-standfirst">
          {isNewBook
            ? 'Nothing written down yet. A mood takes about five seconds and is the easiest place to start.'
            : "Everything you've written down lately, on one page. Pick a line to open it."}
        </p>
        {isNewBook && (
          <Link to="/mood" className="btn btn--solid" style={{ marginTop: '1.4rem' }}>
            <Icon name="plus" size={15} />
            Log your first mood
          </Link>
        )}
      </div>
      <div className="folio-meta">
        <span>
          <b>{dateLine}</b>
        </span>
        <span>{isNewBook ? 'Page one' : 'Folio 01'}</span>
      </div>
    </Reveal>
  )

  if (loading) {
    return (
      <div className="folio">
        {header}
        <div className="ruled-skeleton ruled-skeleton--list" />
      </div>
    )
  }

  const hasMoodData = moodDistribution.some((d) => d.count > 0)
  const latestMood = recentMoods[0]?.mood_score

  return (
    <div className="folio">
      {header}

      <StaggerGroup className="index-table" base={0.05}>
        <StaggerItem index={0}>
          <Link to="/mood" className="index-entry">
            <span className="index-entry-num">01</span>
            <span className="index-entry-label">
              <h2>Mood</h2>
              <p>
                {latestMood ? `Last logged · ${MOOD_LABELS[latestMood]}` : 'Nothing logged yet'}
              </p>
            </span>
            <span className="index-entry-value">
              {recentMoods.length === 0 ? (
                <span className="mono">Awaiting first entry</span>
              ) : (
                <span className="mark-strip">
                  {[...recentMoods].reverse().map((m, i) => (
                    <span
                      className="mark-cell"
                      key={i}
                      title={`${new Date(m.created_at).toLocaleDateString()} · ${MOOD_LABELS[m.mood_score]}`}
                    >
                      <i style={{ height: `${m.mood_score * 20}%` }} />
                    </span>
                  ))}
                </span>
              )}
            </span>
            <Icon name="arrowRight" size={18} className="index-entry-arrow" />
          </Link>
        </StaggerItem>

        <StaggerItem index={1}>
          <Link to="/habits" className="index-entry">
            <span className="index-entry-num">02</span>
            <span className="index-entry-label">
              <h2>Register</h2>
              <p>Habits currently kept</p>
            </span>
            <span className="index-entry-value">
              <span className="figure">
                <span className="figure-num">{String(habitCount).padStart(2, '0')}</span>
                <span className="figure-unit">
                  active habit{habitCount === 1 ? '' : 's'}
                </span>
              </span>
            </span>
            <Icon name="arrowRight" size={18} className="index-entry-arrow" />
          </Link>
        </StaggerItem>

        <StaggerItem index={2}>
          <Link to="/thoughts" className="index-entry">
            <span className="index-entry-num">03</span>
            <span className="index-entry-label">
              <h2>Case notes</h2>
              <p>
                {thoughtCount} record{thoughtCount === 1 ? '' : 's'} on file
              </p>
            </span>
            <span className="index-entry-value">
              {recentThoughts.length === 0 ? (
                <span className="mono">No records yet</span>
              ) : (
                <ul className="excerpt-list">
                  {recentThoughts.map((t) => (
                    <li key={t.id}>{t.situation}</li>
                  ))}
                </ul>
              )}
            </span>
            <Icon name="arrowRight" size={18} className="index-entry-arrow" />
          </Link>
        </StaggerItem>
      </StaggerGroup>

      {hasMoodData && (
        <Reveal as="section" className="panel" index={4}>
          <div className="panel-head">
            <span className="panel-head-num">§ 01</span>
            <h2>Where your moods have landed</h2>
            <span className="panel-head-note">Last {DISTRIBUTION_SAMPLE_SIZE} entries</span>
          </div>
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={moodDistribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--rule)"
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="var(--rule)"
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  width={26}
                />
                <Tooltip
                  content={<DistributionTooltip />}
                  cursor={{ fill: 'var(--text)', opacity: 0.06 }}
                />
                <Bar
                  dataKey="count"
                  fill={accent}
                  onClick={() => navigate('/mood')}
                  style={{ cursor: 'pointer' }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="heat-legend" style={{ justifyContent: 'space-between' }}>
            <span>Click a column to open the mood page</span>
            <span aria-hidden="true" style={{ display: 'flex', gap: '0.4rem', color: 'var(--rule)' }}>
              {MOOD_SCORES.map((s) => (
                <MoodFace key={s} score={s} size={16} />
              ))}
            </span>
          </div>
        </Reveal>
      )}
    </div>
  )
}

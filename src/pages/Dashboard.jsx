import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import useLiveAccentColor from '../hooks/useLiveAccentColor'
import Reveal from '../components/Reveal'
import { StaggerGroup, StaggerItem } from '../components/Stagger'

const MOOD_EMOJI = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' }
const MOOD_SCORES = [1, 2, 3, 4, 5]
const DISTRIBUTION_SAMPLE_SIZE = 90

function greetingForHour(hour) {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function DistributionTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { score, count } = payload[0].payload
  return (
    <div className="chart-tooltip">
      <strong>
        {MOOD_EMOJI[score]} {count}
      </strong>{' '}
      {count === 1 ? 'entry' : 'entries'}
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
  const [moodDistribution, setMoodDistribution] = useState([])

  useEffect(() => {
    async function load() {
      const [{ data: moods }, { count }, { data: thoughts }, { data: distributionRows }] =
        await Promise.all([
          supabase
            .from('mood_logs')
            .select('mood_score, created_at')
            .order('created_at', { ascending: false })
            .limit(7),
          supabase.from('habits').select('id', { count: 'exact', head: true }).eq('archived', false),
          supabase
            .from('thought_records')
            .select('id, situation, created_at')
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

      const counts = Object.fromEntries(MOOD_SCORES.map((s) => [s, 0]))
      for (const row of distributionRows ?? []) counts[row.mood_score] += 1
      setMoodDistribution(MOOD_SCORES.map((score) => ({ score, emoji: MOOD_EMOJI[score], count: counts[score] })))

      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="page">
        <h1>Dashboard</h1>
        <div className="skeleton skeleton-list" />
      </div>
    )
  }

  const hasMoodData = moodDistribution.some((d) => d.count > 0)
  const greeting = greetingForHour(new Date().getHours())

  return (
    <div className="page">
      <Reveal as="header" className="dashboard-hero" y={16}>
        <p className="dashboard-hero-eyebrow">{greeting}{firstName ? `, ${firstName}` : ''}</p>
        <h1>Here's how things are going.</h1>
      </Reveal>

      <StaggerGroup className="dashboard-grid">
        <StaggerItem>
          <Link to="/mood" className="card dashboard-tile" data-variant="mood">
            <h2>Recent mood</h2>
            {recentMoods.length === 0 ? (
              <p className="empty-state">No mood entries yet.</p>
            ) : (
              <div className="mood-strip">
                {[...recentMoods].reverse().map((m, i) => (
                  <span key={i} title={new Date(m.created_at).toLocaleDateString()}>
                    {MOOD_EMOJI[m.mood_score]}
                  </span>
                ))}
              </div>
            )}
          </Link>
        </StaggerItem>

        <StaggerItem>
          <Link to="/habits" className="card dashboard-tile" data-variant="habits">
            <h2>Habits</h2>
            <p className="stat-number">{habitCount}</p>
            <p>active habit{habitCount === 1 ? '' : 's'}</p>
          </Link>
        </StaggerItem>

        <StaggerItem>
          <Link to="/thoughts" className="card dashboard-tile" data-variant="thoughts">
            <h2>Thought records</h2>
            {recentThoughts.length === 0 ? (
              <p className="empty-state">None yet.</p>
            ) : (
              <ul className="dashboard-list">
                {recentThoughts.map((t) => (
                  <li key={t.id}>{t.situation}</li>
                ))}
              </ul>
            )}
          </Link>
        </StaggerItem>
      </StaggerGroup>

      {hasMoodData && (
        <Reveal className="card">
          <h2>Mood distribution</h2>
          <p className="page-intro" style={{ marginTop: 0 }}>
            Last {DISTRIBUTION_SAMPLE_SIZE} entries. Click a bar to see those days.
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={moodDistribution} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="emoji" stroke="var(--muted)" tick={{ fontSize: 16 }} />
              <YAxis allowDecimals={false} stroke="var(--muted)" tick={{ fontSize: 12 }} width={24} />
              <Tooltip content={<DistributionTooltip />} cursor={{ fill: 'var(--shadow-dark)', opacity: 0.4 }} />
              <Bar
                dataKey="count"
                fill={accent}
                radius={[6, 6, 0, 0]}
                onClick={() => navigate('/mood')}
                style={{ cursor: 'pointer' }}
              />
            </BarChart>
          </ResponsiveContainer>
        </Reveal>
      )}
    </div>
  )
}

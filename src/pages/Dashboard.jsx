import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const MOOD_EMOJI = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' }

export default function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [recentMoods, setRecentMoods] = useState([])
  const [habitCount, setHabitCount] = useState(0)
  const [recentThoughts, setRecentThoughts] = useState([])

  useEffect(() => {
    async function load() {
      const [{ data: moods }, { count }, { data: thoughts }] = await Promise.all([
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
      ])
      setRecentMoods(moods ?? [])
      setHabitCount(count ?? 0)
      setRecentThoughts(thoughts ?? [])
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

  return (
    <div className="page">
      <h1>Dashboard</h1>

      <div className="dashboard-grid">
        <Link to="/mood" className="card dashboard-tile">
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

        <Link to="/habits" className="card dashboard-tile">
          <h2>Habits</h2>
          <p className="stat-number">{habitCount}</p>
          <p>active habit{habitCount === 1 ? '' : 's'}</p>
        </Link>

        <Link to="/thoughts" className="card dashboard-tile">
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
      </div>
    </div>
  )
}

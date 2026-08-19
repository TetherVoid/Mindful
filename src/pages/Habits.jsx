import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import ConfirmModal from '../components/ConfirmModal'
import FormSuccess from '../components/FormSuccess'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function computeStreak(dates) {
  const set = new Set(dates)
  let streak = 0
  let cursor = new Date()
  // If today isn't logged yet, start counting from yesterday so an
  // unchecked "today" doesn't zero out an otherwise-intact streak.
  if (!set.has(todayISO())) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export default function Habits() {
  const { user } = useAuth()
  const [habits, setHabits] = useState([])
  const [logsByHabit, setLogsByHabit] = useState({})
  const [loading, setLoading] = useState(true)
  const [newHabit, setNewHabit] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    loadHabits()
  }, [])

  async function loadHabits() {
    setLoading(true)
    const { data: habitRows } = await supabase
      .from('habits')
      .select('id, name, archived, created_at')
      .eq('archived', false)
      .order('created_at', { ascending: true })

    const { data: logRows } = await supabase
      .from('habit_logs')
      .select('habit_id, date')

    const grouped = {}
    for (const log of logRows ?? []) {
      grouped[log.habit_id] = grouped[log.habit_id] ?? []
      grouped[log.habit_id].push(log.date)
    }

    setHabits(habitRows ?? [])
    setLogsByHabit(grouped)
    setLoading(false)
  }

  async function addHabit(e) {
    e.preventDefault()
    if (!newHabit.trim()) return
    await supabase.from('habits').insert({ user_id: user.id, name: newHabit.trim() })
    setNewHabit('')
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 2000)
    loadHabits()
  }

  async function toggleToday(habit) {
    const today = todayISO()
    const doneToday = (logsByHabit[habit.id] ?? []).includes(today)

    if (doneToday) {
      await supabase.from('habit_logs').delete().eq('habit_id', habit.id).eq('date', today)
    } else {
      await supabase.from('habit_logs').insert({ habit_id: habit.id, user_id: user.id, date: today })
    }
    loadHabits()
  }

  async function confirmDelete() {
    await supabase.from('habits').update({ archived: true }).eq('id', pendingDelete.id)
    setPendingDelete(null)
    loadHabits()
  }

  return (
    <div className="page">
      <h1>Habits</h1>

      <form className="card habit-form" onSubmit={addHabit}>
        <input
          type="text"
          placeholder="New habit, e.g. 10 minutes of meditation"
          value={newHabit}
          onChange={(e) => setNewHabit(e.target.value)}
        />
        <button type="submit" className="btn-primary">
          Add
        </button>
      </form>
      <FormSuccess visible={showSuccess} message="Habit added." />

      {loading ? (
        <div className="skeleton skeleton-list" />
      ) : habits.length === 0 ? (
        <p className="empty-state">No habits yet — add one above.</p>
      ) : (
        <div className="habit-list">
          {habits.map((habit) => {
            const dates = logsByHabit[habit.id] ?? []
            const doneToday = dates.includes(todayISO())
            const streak = computeStreak(dates)
            return (
              <div className="card habit-row" key={habit.id}>
                <button
                  type="button"
                  className={`habit-check ${doneToday ? 'checked' : ''}`}
                  onClick={() => toggleToday(habit)}
                  aria-pressed={doneToday}
                  aria-label={`Mark ${habit.name} done today`}
                >
                  {doneToday ? '✓' : ''}
                </button>
                <div className="habit-info">
                  <span className="habit-name">{habit.name}</span>
                  <span className="habit-streak">{streak} day streak</span>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPendingDelete(habit)}
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      )}

      <ConfirmModal
        open={!!pendingDelete}
        title="Remove habit?"
        message={`This will archive "${pendingDelete?.name}". Its history is kept.`}
        confirmLabel="Remove"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

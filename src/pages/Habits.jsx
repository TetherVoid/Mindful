import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { toLocalISODate, todayISO } from '../lib/date'
import ConfirmModal from '../components/ConfirmModal'
import FormSuccess from '../components/FormSuccess'
import HabitHeatmap from '../components/HabitHeatmap'
import Reveal from '../components/Reveal'
import { StaggerGroup, StaggerItem } from '../components/Stagger'

function computeStreak(dates) {
  const set = new Set(dates)
  let streak = 0
  let cursor = new Date()
  // If today isn't logged yet, start counting from yesterday so an
  // unchecked "today" doesn't zero out an otherwise-intact streak.
  if (!set.has(todayISO())) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (set.has(toLocalISODate(cursor))) {
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
  const [error, setError] = useState(null)
  const [pendingToggle, setPendingToggle] = useState(() => new Set())

  async function loadHabits() {
    setLoading(true)
    setError(null)

    const [{ data: habitRows, error: habitsError }, { data: logRows, error: logsError }] =
      await Promise.all([
        supabase
          .from('habits')
          .select('id, name, archived, created_at')
          .eq('archived', false)
          .order('created_at', { ascending: true }),
        supabase.from('habit_logs').select('habit_id, date'),
      ])

    if (habitsError || logsError) {
      setError((habitsError ?? logsError).message)
      setLoading(false)
      return
    }

    const grouped = {}
    for (const log of logRows ?? []) {
      grouped[log.habit_id] = grouped[log.habit_id] ?? []
      grouped[log.habit_id].push(log.date)
    }

    setHabits(habitRows ?? [])
    setLogsByHabit(grouped)
    setLoading(false)
  }

  useEffect(() => {
    loadHabits()
  }, [])

  async function addHabit(e) {
    e.preventDefault()
    const name = newHabit.trim()
    if (!name) return

    setError(null)
    const { data, error: insertError } = await supabase
      .from('habits')
      .insert({ user_id: user.id, name })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    setHabits((prev) => [...prev, data])
    setNewHabit('')
    setShowSuccess(true)
    setTimeout(() => setShowSuccess(false), 2000)
  }

  async function toggleToday(habit) {
    if (pendingToggle.has(habit.id)) return

    const today = todayISO()
    const doneToday = (logsByHabit[habit.id] ?? []).includes(today)

    setPendingToggle((prev) => new Set(prev).add(habit.id))
    setError(null)

    const { error: toggleError } = doneToday
      ? await supabase.from('habit_logs').delete().eq('habit_id', habit.id).eq('date', today)
      : await supabase.from('habit_logs').insert({ habit_id: habit.id, user_id: user.id, date: today })

    setPendingToggle((prev) => {
      const next = new Set(prev)
      next.delete(habit.id)
      return next
    })

    if (toggleError) {
      setError(toggleError.message)
      return
    }

    setLogsByHabit((prev) => {
      const dates = prev[habit.id] ?? []
      return {
        ...prev,
        [habit.id]: doneToday ? dates.filter((d) => d !== today) : [...dates, today],
      }
    })
  }

  async function confirmDelete() {
    const { error: deleteError } = await supabase
      .from('habits')
      .update({ archived: true })
      .eq('id', pendingDelete.id)

    if (deleteError) {
      setError(deleteError.message)
      setPendingDelete(null)
      return
    }

    setHabits((prev) => prev.filter((h) => h.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  return (
    <div className="page">
      <h1>Habits</h1>

      {error && <div className="form-error">{error}</div>}

      <Reveal as="form" className="card habit-form" onSubmit={addHabit}>
        <input
          type="text"
          placeholder="New habit, e.g. 10 minutes of meditation"
          value={newHabit}
          onChange={(e) => setNewHabit(e.target.value)}
        />
        <button type="submit" className="btn-primary">
          Add
        </button>
      </Reveal>
      <FormSuccess visible={showSuccess} message="Habit added." />

      {loading ? (
        <div className="skeleton skeleton-list" />
      ) : habits.length === 0 ? (
        <p className="empty-state">No habits yet — add one above.</p>
      ) : (
        <StaggerGroup className="habit-list">
          {habits.map((habit) => {
            const dates = logsByHabit[habit.id] ?? []
            const doneToday = dates.includes(todayISO())
            const streak = computeStreak(dates)
            return (
              <StaggerItem className="card habit-row" key={habit.id}>
                <button
                  type="button"
                  className={`habit-check ${doneToday ? 'checked' : ''}`}
                  onClick={() => toggleToday(habit)}
                  disabled={pendingToggle.has(habit.id)}
                  aria-pressed={doneToday}
                  aria-label={`Mark ${habit.name} done today`}
                >
                  {doneToday ? '✓' : ''}
                </button>
                <div className="habit-info">
                  <span className="habit-name">{habit.name}</span>
                  <button
                    type="button"
                    className="habit-streak habit-streak-link"
                    onClick={() =>
                      document.getElementById('habit-heatmap')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }
                  >
                    {streak} day streak
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setPendingDelete(habit)}
                >
                  Remove
                </button>
              </StaggerItem>
            )
          })}
        </StaggerGroup>
      )}

      {!loading && (
        <Reveal>
          <HabitHeatmap habits={habits} logsByHabit={logsByHabit} id="habit-heatmap" />
        </Reveal>
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

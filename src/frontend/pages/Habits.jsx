import { useEffect, useState } from 'react'
import {
  listHabitsWithLogs,
  createHabit,
  setHabitDone,
  archiveHabit,
} from '@backend/services/habits'
import { useAuth } from '@backend/auth/AuthContext'
import { toLocalISODate, todayISO } from '@shared/utils/date'
import ConfirmModal from '@frontend/components/ConfirmModal'
import FormSuccess from '@frontend/components/FormSuccess'
import FormError from '@frontend/components/FormError'
import HabitHeatmap from '@frontend/components/HabitHeatmap'
import MarginNote from '@frontend/components/MarginNote'
import { loadInsights } from '@backend/services/report/data'
import { habitObservations } from '@backend/services/report/observations'
import Reveal from '@design/primitives/Reveal'
import { StaggerGroup, StaggerItem } from '@design/primitives/Stagger'
import Icon from '@design/primitives/Icon'
import { TEXT_LIMITS } from '@shared/constants/limits'

const HOT_STREAK = 7

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
  // What the register and the mood log say together. Loaded separately, so
  // the checklist never waits on it.
  const [observations, setObservations] = useState([])

  async function loadObservations() {
    const { data } = await loadInsights()
    if (data) setObservations(habitObservations(data))
  }

  async function loadHabits() {
    setLoading(true)
    setError(null)

    const { data, error: loadError } = await listHabitsWithLogs()

    if (loadError) {
      setError(loadError.message)
      setLoading(false)
      return
    }

    setHabits(data.habits)
    setLogsByHabit(data.logsByHabit)
    setLoading(false)
  }

  useEffect(() => {
    loadHabits()
    loadObservations()
  }, [])

  async function addHabit(e) {
    e.preventDefault()
    const name = newHabit.trim()
    if (!name) return

    setError(null)
    const { data, error: insertError } = await createHabit({ userId: user.id, name })

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

    const { error: toggleError } = await setHabitDone({
      habitId: habit.id,
      userId: user.id,
      date: today,
      done: doneToday,
    })

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
    const { error: deleteError } = await archiveHabit(pendingDelete.id)

    if (deleteError) {
      setError(deleteError.message)
      setPendingDelete(null)
      return
    }

    setHabits((prev) => prev.filter((h) => h.id !== pendingDelete.id))
    setPendingDelete(null)
  }

  const doneCount = habits.filter((h) => (logsByHabit[h.id] ?? []).includes(todayISO())).length

  return (
    <div className="folio">
      <Reveal as="header" className="folio-head" y={14} index={0}>
        <div>
          <p className="folio-kicker">Section 03</p>
          <h1 className="folio-title">
            The <em>register</em>
          </h1>
          <p className="folio-standfirst">
            Small things, ticked off daily. The point isn't a perfect column — it's noticing the
            gaps.
          </p>
        </div>
        <div className="folio-meta">
          <span>
            <b>
              {doneCount}/{habits.length}
            </b>{' '}
            done today
          </span>
          <span>{new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</span>
        </div>
      </Reveal>

      <FormError message={error} label="Register" />

      <Reveal as="form" className="inline-form" index={1} onSubmit={addHabit}>
        <label className="mono" htmlFor="new-habit" style={{ position: 'absolute', left: -9999 }}>
          New habit
        </label>
        <input
          id="new-habit"
          type="text"
          placeholder="Add a habit — e.g. ten minutes of quiet"
          value={newHabit}
          onChange={(e) => setNewHabit(e.target.value)}
          maxLength={TEXT_LIMITS.habitName}
        />
        <button type="submit" className="btn btn--ink">
          <Icon name="plus" size={15} />
          Enter
        </button>
      </Reveal>
      <FormSuccess visible={showSuccess} message="Added to the register." />

      {loading ? (
        <div className="ruled-skeleton ruled-skeleton--list" />
      ) : habits.length === 0 ? (
        <p className="empty-state">The register is empty — write the first line above.</p>
      ) : (
        <StaggerGroup className="register" base={0.06}>
          {habits.map((habit, i) => {
            const dates = logsByHabit[habit.id] ?? []
            const doneToday = dates.includes(todayISO())
            const streak = computeStreak(dates)
            return (
              <StaggerItem className={`register-row ${doneToday ? 'done' : ''}`} index={i} key={habit.id}>
                <button
                  type="button"
                  className={`tick-box ${doneToday ? 'checked' : ''}`}
                  onClick={() => toggleToday(habit)}
                  disabled={pendingToggle.has(habit.id)}
                  aria-pressed={doneToday}
                  aria-label={`Mark "${habit.name}" done today`}
                >
                  <Icon name="check" size={17} stroke={2} />
                </button>

                <span className="register-name">{habit.name}</span>

                <button
                  type="button"
                  className={`streak ${streak >= HOT_STREAK ? 'hot' : ''}`}
                  onClick={() =>
                    document
                      .getElementById('habit-heatmap')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                  aria-label={`${streak} day streak — show on the calendar`}
                >
                  <b>{String(streak).padStart(2, '0')}</b>
                  <span>day{streak === 1 ? '' : 's'}</span>
                </button>

                <span className="register-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setPendingDelete(habit)}
                    aria-label={`Remove "${habit.name}"`}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </span>
              </StaggerItem>
            )
          })}
        </StaggerGroup>
      )}

      {!loading && observations.length > 0 && (
        <Reveal index={Math.min(habits.length, 6)}>
          {observations.map((o, i) => (
            <MarginNote key={o.kind} observation={o} kicker={i === 0 ? 'What the register shows' : null} />
          ))}
        </Reveal>
      )}

      {!loading && (
        <Reveal index={Math.min(habits.length, 6)}>
          <HabitHeatmap habits={habits} logsByHabit={logsByHabit} id="habit-heatmap" />
        </Reveal>
      )}

      <ConfirmModal
        open={!!pendingDelete}
        slug="Strike from the register"
        title="Remove this habit?"
        message={`"${pendingDelete?.name}" will be struck from the register. Its history stays on the calendar.`}
        confirmLabel="Strike it"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

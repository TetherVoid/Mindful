import { supabase } from '../database/client'
import { TABLES } from '@shared/constants/tables'

// The habit register: habits, their ticks, and the counts the dashboard shows.

/**
 * Active habits plus every tick, grouped by habit id.
 *
 * The grouping happens here rather than in the page because it is a property of
 * how the two tables relate, not of how they are displayed.
 *
 * @returns {Promise<import('@shared/contracts').ServiceResult<{ habits: import('@shared/contracts').Habit[], logsByHabit: Record<string, string[]> }>>}
 */
export async function listHabitsWithLogs() {
  const [{ data: habitRows, error: habitsError }, { data: logRows, error: logsError }] =
    await Promise.all([
      supabase
        .from(TABLES.habits)
        .select('id, name, archived, created_at')
        .eq('archived', false)
        .order('created_at', { ascending: true }),
      supabase.from(TABLES.habitLogs).select('habit_id, date'),
    ])

  const error = habitsError ?? logsError
  if (error) return { data: null, error }

  const logsByHabit = {}
  for (const log of logRows ?? []) {
    logsByHabit[log.habit_id] = logsByHabit[log.habit_id] ?? []
    logsByHabit[log.habit_id].push(log.date)
  }

  return { data: { habits: habitRows ?? [], logsByHabit }, error: null }
}

/** Habits and raw logs, unjoined — what the report's analysis wants. */
export function listHabits(columns = 'id, name, archived, created_at') {
  return supabase.from(TABLES.habits).select(columns)
}

export function listHabitLogs(columns = 'habit_id, date') {
  return supabase.from(TABLES.habitLogs).select(columns)
}

/** Count only, no rows fetched. */
export function countActiveHabits() {
  return supabase
    .from(TABLES.habits)
    .select('id', { count: 'exact', head: true })
    .eq('archived', false)
}

export function createHabit({ userId, name }) {
  return supabase.from(TABLES.habits).insert({ user_id: userId, name }).select().single()
}

/**
 * Tick or un-tick a habit for one date.
 *
 * `done` describes the state BEFORE the call — passing the current state rather
 * than the desired one keeps the caller's optimistic update and this write
 * reading from the same fact.
 */
export function setHabitDone({ habitId, userId, date, done }) {
  return done
    ? supabase.from(TABLES.habitLogs).delete().eq('habit_id', habitId).eq('date', date)
    : supabase.from(TABLES.habitLogs).insert({ habit_id: habitId, user_id: userId, date })
}

/**
 * Retire a habit.
 *
 * Archives rather than deletes, so the habit_logs rows behind it survive and
 * past streaks stay truthful in the heatmap and the report.
 */
export function archiveHabit(habitId) {
  return supabase.from(TABLES.habits).update({ archived: true }).eq('id', habitId)
}

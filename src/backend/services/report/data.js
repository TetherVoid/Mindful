import { listRecentMoods } from '../moods'
import { listHabits, listHabitLogs } from '../habits'
import { listThoughtRecords } from '../thoughts'

// How much history the report reads. Half a year of moods is enough for a
// weekday pattern to hold up, and both caps keep the derived payload well
// under the size /api/report will accept.
export const MOOD_WINDOW = 180
export const THOUGHT_WINDOW = 100

/**
 * Everything the reading needs, in one round of parallel queries.
 * @returns {Promise<import('@shared/contracts').ServiceResult<{
 *   moods: import('@shared/contracts').MoodLog[],
 *   habits: import('@shared/contracts').Habit[],
 *   habitLogs: import('@shared/contracts').HabitLog[],
 *   thoughts: import('@shared/contracts').ThoughtRecord[],
 * }>>}
 */
export async function loadReportData() {
  const [moods, habits, habitLogs, thoughts] = await Promise.all([
    listRecentMoods(MOOD_WINDOW, 'mood_score, note, created_at'),
    listHabits('id, name, archived, created_at'),
    listHabitLogs('habit_id, date'),
    listThoughtRecords(THOUGHT_WINDOW, '*'),
  ])

  const error = moods.error ?? habits.error ?? habitLogs.error ?? thoughts.error
  if (error) return { data: null, error }

  return {
    data: {
      moods: moods.data ?? [],
      habits: habits.data ?? [],
      habitLogs: habitLogs.data ?? [],
      thoughts: thoughts.data ?? [],
    },
    error: null,
  }
}

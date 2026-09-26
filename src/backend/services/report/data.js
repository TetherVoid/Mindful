import { listRecentMoods, countMoods } from '../moods'
import { listHabits, listHabitLogs } from '../habits'
import { listThoughtRecordsWithCount } from '../thoughts'
import { buildInsights } from './insights'

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
  const [moods, moodTotal, habits, habitLogs, thoughts] = await Promise.all([
    listRecentMoods(MOOD_WINDOW, 'mood_score, note, created_at'),
    countMoods(),
    listHabits('id, name, archived, created_at'),
    listHabitLogs('habit_id, date'),
    listThoughtRecordsWithCount(THOUGHT_WINDOW, '*'),
  ])

  const error = moods.error ?? moodTotal.error ?? habits.error ?? habitLogs.error ?? thoughts.error
  if (error) return { data: null, error }

  return {
    data: {
      moods: moods.data ?? [],
      habits: habits.data ?? [],
      habitLogs: habitLogs.data ?? [],
      thoughts: thoughts.data ?? [],
      // How many are on file in all, so the page can say "your latest 100 of
      // 214" rather than implying the window is everything.
      onFile: {
        moods: moodTotal.count ?? (moods.data ?? []).length,
        thoughts: thoughts.count ?? (thoughts.data ?? []).length,
      },
    },
    error: null,
  }
}

/**
 * Figures for the day sheet, the mood page and the habits page.
 *
 * Reads the same windows as the reading, so the numbers agree, but only the
 * columns the figures need: scores and dates, not notes. Thought records are
 * left out entirely — none of these pages uses their figures, and the one
 * comparison built from them is kept to the reading (see observations.js).
 *
 * @returns {Promise<import('@shared/contracts').ServiceResult<ReturnType<typeof buildInsights>>>}
 */
export async function loadInsights() {
  const [moods, habits, habitLogs] = await Promise.all([
    listRecentMoods(MOOD_WINDOW, 'mood_score, created_at'),
    listHabits('id, name, archived, created_at'),
    listHabitLogs('habit_id, date'),
  ])

  const error = moods.error ?? habits.error ?? habitLogs.error
  if (error) return { data: null, error }

  return {
    data: buildInsights({
      moods: moods.data ?? [],
      habits: habits.data ?? [],
      habitLogs: habitLogs.data ?? [],
    }),
    error: null,
  }
}

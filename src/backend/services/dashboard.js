import { listRecentMoods, listMoodScores } from './moods'
import { countActiveHabits } from './habits'
import { listThoughtRecordsWithCount } from './thoughts'

// The day sheet reads a little of everything, so its four queries are issued
// together rather than in series — the page's loading state ends when the
// slowest one lands, not when the last one starts.

/**
 * @returns {Promise<import('@shared/contracts').ServiceResult<{
 *   recentMoods: import('@shared/contracts').MoodLog[],
 *   habitCount: number,
 *   recentThoughts: import('@shared/contracts').ThoughtRecord[],
 *   thoughtCount: number,
 *   distributionScores: { mood_score: number }[],
 * }>>}
 */
export async function loadDashboard({ moodPreview = 7, thoughtPreview = 3, distributionSample = 90 } = {}) {
  const [moods, habits, thoughts, distribution] = await Promise.all([
    listRecentMoods(moodPreview, 'mood_score, created_at'),
    countActiveHabits(),
    listThoughtRecordsWithCount(thoughtPreview, 'id, situation, created_at'),
    listMoodScores(distributionSample),
  ])

  const error = moods.error ?? habits.error ?? thoughts.error ?? distribution.error
  if (error) return { data: null, error }

  return {
    data: {
      recentMoods: moods.data ?? [],
      habitCount: habits.count ?? 0,
      recentThoughts: thoughts.data ?? [],
      thoughtCount: thoughts.count ?? 0,
      distributionScores: distribution.data ?? [],
    },
    error: null,
  }
}

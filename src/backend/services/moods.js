import { supabase } from '../database/client'
import { TABLES } from '@shared/constants/tables'

// Mood log reads and writes.
//
// Every function returns Supabase's own `{ data, error }` shape. That is
// deliberate: the pages already handle errors that way, so moving a query
// behind a service is a one-line change at the call site and cannot quietly
// alter how a failure is surfaced.

/**
 * The most recent `limit` entries, newest first.
 *
 * Ordering descending and then limiting is load-bearing. Ascending-with-limit
 * would fetch the N OLDEST rows and get permanently stuck once a user passes N
 * logs — the chart would freeze on their first fortnight forever.
 *
 * @returns {Promise<import('@shared/contracts').ServiceResult<import('@shared/contracts').MoodLog[]>>}
 */
export function listRecentMoods(limit, columns = 'id, mood_score, note, created_at') {
  return supabase
    .from(TABLES.moodLogs)
    .select(columns)
    .order('created_at', { ascending: false })
    .limit(limit)
}

/** The same rows in chronological order, which is what a time-series chart wants. */
export async function listRecentMoodsChronological(limit, columns) {
  const { data, error } = await listRecentMoods(limit, columns)
  if (error) return { data: null, error }
  return { data: (data ?? []).slice().reverse(), error: null }
}

/**
 * How many mood entries the reader has in all. A count only — no rows come
 * back — so a page can say "240 in all" beside a chart of the last 30.
 */
export function countMoods() {
  return supabase.from(TABLES.moodLogs).select('id', { count: 'exact', head: true })
}

/** Scores only — enough to build a distribution, without pulling note text. */
export function listMoodScores(limit) {
  return supabase
    .from(TABLES.moodLogs)
    .select('mood_score')
    .order('created_at', { ascending: false })
    .limit(limit)
}

export function createMood({ userId, moodScore, note }) {
  return supabase
    .from(TABLES.moodLogs)
    .insert({ user_id: userId, mood_score: moodScore, note })
    .select()
    .single()
}

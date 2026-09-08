import { supabase } from '../database/client'
import { TABLES } from '@shared/constants/tables'

// Whole-account operations: take everything out, or destroy everything.
//
// Both walk the same four tables. Keeping them side by side means a table added
// to the schema gets noticed here — an export that silently omits a table, or a
// delete that silently leaves one behind, is the failure mode worth guarding.
const OWNED_TABLES = [TABLES.moodLogs, TABLES.habits, TABLES.habitLogs, TABLES.thoughtRecords]

/**
 * Every row this user owns, keyed by table name.
 * @returns {Promise<import('@shared/contracts').ServiceResult<Record<string, object[]>>>}
 */
export async function exportAllData(userId) {
  const results = await Promise.all(
    OWNED_TABLES.map((table) => supabase.from(table).select('*').eq('user_id', userId))
  )

  const error = results.map((r) => r.error).find(Boolean)
  if (error) return { data: null, error }

  const data = { exported_at: new Date().toISOString() }
  OWNED_TABLES.forEach((table, i) => {
    data[table] = results[i].data ?? []
  })
  return { data, error: null }
}

/**
 * Delete every row this user owns.
 *
 * Order matters: habit_logs go before habits. The foreign key cascades, so the
 * reverse order would work too, but deleting children first means a partial
 * failure never leaves logs orphaned against a habit that no longer exists.
 *
 * This does not delete the auth user — only their data. Account deletion needs
 * the service-role key and belongs on the server, not in the browser.
 */
export async function deleteAllData(userId) {
  const ordered = [TABLES.moodLogs, TABLES.habitLogs, TABLES.habits, TABLES.thoughtRecords]
  const results = await Promise.all(
    ordered.map((table) => supabase.from(table).delete().eq('user_id', userId))
  )
  const error = results.map((r) => r.error).find(Boolean)
  return { data: error ? null : true, error: error ?? null }
}

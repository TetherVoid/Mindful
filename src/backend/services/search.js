import { supabase } from '../database/client'
import { TABLES } from '@shared/constants/tables'

// PostgREST's `.or()` filter string treats commas and parens as structural
// separators. Quoting the value and escaping any backslash/quote inside it
// keeps user-typed punctuation (",", "(", ")") from breaking the filter — or
// from being used to inject extra filter clauses.
function escapeForOrFilter(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Free-text search across the situation and automatic-thought columns.
 *
 * The escaping above is the reason this lives in a service rather than in the
 * search overlay: it is a property of the query language, not of the UI, and it
 * must not be re-implemented by whoever next builds a search box.
 *
 * @returns {Promise<import('@shared/contracts').ServiceResult<import('@shared/contracts').ThoughtRecord[]>>}
 */
export function searchThoughtRecords(query, limit = 5) {
  const pattern = escapeForOrFilter(`%${query}%`)
  return supabase
    .from(TABLES.thoughtRecords)
    .select('id, situation, automatic_thought')
    .or(`situation.ilike.${pattern},automatic_thought.ilike.${pattern}`)
    .limit(limit)
}

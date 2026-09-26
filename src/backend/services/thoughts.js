import { supabase } from '../database/client'
import { TABLES } from '@shared/constants/tables'

// CBT thought records.

/** @returns {Promise<import('@shared/contracts').ServiceResult<import('@shared/contracts').ThoughtRecord[]>>} */
export function listThoughtRecords(limit, columns = '*') {
  return supabase
    .from(TABLES.thoughtRecords)
    .select(columns)
    .order('created_at', { ascending: false })
    .limit(limit)
}

/**
 * One page of records, newest first, with the exact total on file. The total
 * is what the page says; the page length is only how many are shown so far.
 *
 * @returns {Promise<import('@shared/contracts').ServiceResult<import('@shared/contracts').ThoughtRecord[]> & { count: number | null }>}
 */
export function listThoughtRecordsPage({ offset = 0, limit = 20 } = {}, columns = '*') {
  return supabase
    .from(TABLES.thoughtRecords)
    .select(columns, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
}

/** Rows plus an exact total, for a page that shows both a preview and a count. */
export function listThoughtRecordsWithCount(limit, columns = '*') {
  return supabase
    .from(TABLES.thoughtRecords)
    .select(columns, { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit)
}

export function createThoughtRecord({ userId, ...fields }) {
  return supabase
    .from(TABLES.thoughtRecords)
    .insert({ user_id: userId, ...fields })
    .select()
    .single()
}

export function deleteThoughtRecord(id) {
  return supabase.from(TABLES.thoughtRecords).delete().eq('id', id)
}

import { DAILY_QUOTA_MESSAGE } from '@shared/constants/limits'

// The journal tables allow a fixed number of new rows per account per day
// (20260927000100_text_limits_and_insert_quotas.sql). Over it, the database
// raises SQLSTATE PT429, which reaches supabase-js as `error.code === 'PT429'`
// with a message written for logs, not for a student. This swaps in the
// sentence the page should show and leaves every other result untouched, so
// callers keep handling `{ data, error }` exactly as before.
export async function withQuotaMessage(request) {
  const result = await request
  if (result?.error?.code !== 'PT429') return result
  return { ...result, error: { ...result.error, message: DAILY_QUOTA_MESSAGE } }
}

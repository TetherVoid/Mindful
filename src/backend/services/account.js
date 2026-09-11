import { supabase, isFixtureMode } from '../database/client'
import { TABLES } from '@shared/constants/tables'

// Whole-account operations: take everything out, or destroy everything.
//
// Both walk the same four tables. Keeping them side by side means a table added
// to the schema gets noticed here — an export that silently omits a table, or a
// delete that silently leaves one behind, is the failure mode worth guarding.
const OWNED_TABLES = [TABLES.moodLogs, TABLES.habits, TABLES.habitLogs, TABLES.thoughtRecords]

// The signed-in user, from the auth server rather than from an argument.
//
// exportAllData and deleteAllData take a userId from the caller. RLS means a
// wrong one returns nothing rather than somebody else's rows, so it was never a
// hole — but "the id the page happened to have" and "the id this request is
// authenticated as" are different facts, and for an export and a delete it
// ought to be the second. The argument is still accepted, so existing call
// sites keep working unchanged; it is now only a fallback.
async function resolveUserId(explicitId) {
  const { data, error } = await supabase.auth.getUser()
  if (!error && data?.user?.id) return data.user.id
  return explicitId ?? null
}

/**
 * Every row this user owns, keyed by table name.
 * @returns {Promise<import('@shared/contracts').ServiceResult<Record<string, object[]>>>}
 */
export async function exportAllData(userId) {
  const id = await resolveUserId(userId)
  if (!id) return { data: null, error: { message: 'Sign in to export your data.' } }

  const results = await Promise.all(
    OWNED_TABLES.map((table) => supabase.from(table).select('*').eq('user_id', id))
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
 * That ordering was previously written as a Promise.all, which issues all four
 * at once and guarantees nothing about which lands first. Awaiting them in turn
 * is what actually makes the comment above true, and it stops a failure halfway
 * through from being reported as a success for the tables that did go.
 *
 * This does not delete the auth user — only their data. For that, see
 * deleteAccount() below.
 */
export async function deleteAllData(userId) {
  const id = await resolveUserId(userId)
  if (!id) return { data: null, error: { message: 'Sign in to delete your data.' } }

  const ordered = [TABLES.moodLogs, TABLES.habitLogs, TABLES.habits, TABLES.thoughtRecords]
  for (const table of ordered) {
    const { error } = await supabase.from(table).delete().eq('user_id', id)
    if (error) return { data: null, error }
  }
  return { data: true, error: null }
}

/**
 * Switch this account off without deleting anything.
 *
 * The middle option between "keep using it" and "delete everything": the rows
 * stay, and the account loses access to all of them — the four owner policies
 * carry `not is_deactivated()`. Class memberships are cleared so the user stops
 * appearing on a roster.
 *
 * The function takes no arguments on purpose. There is no user id in its
 * signature and none in its body except `auth.uid()`, so a caller has nowhere
 * to name somebody else. It only ever *sets* `deactivated_at`, so it is not a
 * toggle and cannot undo an administrator's suspension; reactivation is
 * set_account_active(), which is administrator-only.
 *
 * Returns `true` when this call is what deactivated the account and `false`
 * when it already was — both mean the account is now off, so neither is an
 * error. The caller should sign out afterwards: the session stays valid until
 * it is next used, and the app would otherwise spend the next hour making
 * requests that every policy now refuses.
 *
 * @returns {Promise<import('@shared/contracts').ServiceResult<boolean>>}
 */
export async function deactivateMyAccount() {
  if (isFixtureMode) {
    return { data: null, error: { message: 'There is no account to deactivate on sample data.' } }
  }
  return supabase.rpc('deactivate_my_account')
}

/**
 * Delete the account itself: the auth user, and by cascade every row it owns.
 *
 * The browser cannot do this. Removing an auth user is a service-role
 * operation, and a service-role key in a client bundle would let anyone holding
 * the page delete anyone. So the request goes to /api/account, which verifies
 * the caller's own token and then deletes the user that token belongs to —
 * there is no user id in the request for anybody to change.
 *
 * Returns `{ data: true, error: null }` on success. On a deployment with no
 * service-role key configured it returns an error saying so, rather than
 * reporting a deletion that did not happen.
 */
export async function deleteAccount() {
  if (isFixtureMode) {
    return { data: null, error: { message: 'There is no account to delete on sample data.' } }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) return { data: null, error: { message: 'Sign in again to delete your account.' } }

  let response
  try {
    response = await fetch('/api/account', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    return { data: null, error: { message: 'Could not reach the server. Nothing was deleted.' } }
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    return { data: null, error: { message: body.error ?? 'The account could not be deleted.' } }
  }

  // The session refers to nobody the moment the user is gone; clearing it stops
  // the app spending the next few minutes making requests with a dead token.
  try {
    await supabase.auth.signOut()
  } catch {
    // Already unusable. Nothing to recover.
  }
  return { data: true, error: null }
}

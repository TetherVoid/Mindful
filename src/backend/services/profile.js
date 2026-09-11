import { supabase } from '../database/client'
import { TABLES } from '@shared/constants/tables'

// Who the signed-in person is, as far as authorisation is concerned.
//
// The role is never read from the JWT or from user metadata. Both are shaped by
// whatever the browser sent at signup, so both are attacker-controlled; the
// only trustworthy source is the `profiles` row, and the only way to change it
// is set_user_role(), which is administrator-only. Everything here is a
// convenience for rendering — the database enforces the same rules again on
// every query, so a tampered `role` in this object buys nothing.

export const ROLES = Object.freeze({ student: 'student', teacher: 'teacher', admin: 'admin' })

const ROLE_VALUES = Object.values(ROLES)

/** @param {unknown} value */
export function isKnownRole(value) {
  return ROLE_VALUES.includes(value)
}

/**
 * The caller's own profile: role, display name, teacher-visibility choice.
 *
 * Goes through the `my_profile()` function rather than selecting from
 * `profiles` so there is one shape to maintain, and so a future column added to
 * the table is not exposed to the client by accident.
 *
 * @returns {Promise<import('@shared/contracts').ServiceResult<import('@shared/contracts').Profile>>}
 */
export async function getMyProfile() {
  const { data, error } = await supabase.rpc('my_profile')
  if (error) return { data: null, error }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    // No row is a real state, not a failure: an account created before the
    // signup trigger existed has none. Treat it as the least-privileged case
    // rather than inventing one, and let the caller decide what to show.
    return { data: null, error: null }
  }
  return { data: normaliseProfile(row), error: null }
}

function normaliseProfile(row) {
  return {
    id: row.id,
    role: isKnownRole(row.role) ? row.role : ROLES.student,
    display_name: row.display_name ?? null,
    // Absent reads as "no". The database column is NOT NULL so this should
    // never be undefined, but consent that was never recorded is not consent,
    // and the direction a missing value falls in is the whole point of an
    // opt-in default.
    share_with_teachers: row.share_with_teachers === true,
    deactivated_at: row.deactivated_at ?? null,
    created_at: row.created_at ?? null,
  }
}

/**
 * Update the two fields a user owns about themselves.
 *
 * `role` and `deactivated_at` are deliberately not accepted here. They are also
 * not writable at the database level — `authenticated` holds no UPDATE
 * privilege on those columns — so a caller that passes them anyway gets them
 * dropped here and would be refused there too.
 */
export async function updateMyProfile({ displayName, shareWithTeachers } = {}) {
  const { data: sessionData } = await supabase.auth.getUser()
  const userId = sessionData?.user?.id
  if (!userId) return { data: null, error: { message: 'Sign in to change your profile.' } }

  const patch = {}
  if (displayName !== undefined) {
    const trimmed = String(displayName ?? '').trim()
    if (trimmed.length > 120) {
      return { data: null, error: { message: 'A display name can be at most 120 characters.' } }
    }
    patch.display_name = trimmed === '' ? null : trimmed
  }
  if (shareWithTeachers !== undefined) patch.share_with_teachers = Boolean(shareWithTeachers)

  if (Object.keys(patch).length === 0) return { data: null, error: null }

  return supabase.from(TABLES.profiles).update(patch).eq('id', userId).select().single()
}

// --- Administration ---------------------------------------------------------
//
// Both calls are administrator-only and both are enforced in the database, not
// here. The role check below exists so the UI can hide a control, never as the
// thing that stops a non-administrator: an ordinary user who calls these gets a
// 42501 back from Postgres.

/**
 * Promote or demote another user.
 *
 * Refused by the database if the caller is not an administrator, if they are
 * naming themselves, or if it would remove the last administrator. Every
 * successful change is written to `role_change_audit`.
 */
export async function setUserRole({ userId, role, reason = null }) {
  if (!isKnownRole(role)) return { data: null, error: { message: `Unknown role: ${role}` } }
  return supabase.rpc('set_user_role', { p_user_id: userId, p_role: role, p_reason: reason })
}

/** Suspend an account, or bring it back. Suspension also empties its class memberships. */
export async function setAccountActive({ userId, active }) {
  return supabase.rpc('set_account_active', { p_user_id: userId, p_active: Boolean(active) })
}

/**
 * The user directory: the only call in the app that returns another person's
 * email address.
 *
 * Administrator-only, and enforced inside `admin_list_users()` rather than
 * here — a non-administrator calling this gets 42501 back from Postgres. The
 * function clamps `page_limit` to 1..100 itself, so the value below is a
 * request rather than a guarantee.
 *
 * Paging is offset-based because the underlying function is: it orders by
 * `created_at, id` and takes a limit and an offset.
 *
 * @returns {Promise<import('@shared/contracts').ServiceResult<import('@shared/contracts').DirectoryUser[]>>}
 */
export function adminListUsers({ search = null, limit = 25, offset = 0 } = {}) {
  const needle = String(search ?? '').trim()
  return supabase.rpc('admin_list_users', {
    search: needle === '' ? null : needle,
    page_limit: Math.min(Math.max(Number(limit) || 25, 1), 100),
    page_offset: Math.max(Number(offset) || 0, 0),
  })
}

/** The role-change history for one user. Readable by administrators and by that user. */
export function listRoleChanges(userId, limit = 50) {
  return supabase
    .from(TABLES.roleChangeAudit)
    .select('id, target_user_id, previous_role, new_role, changed_by, reason, created_at')
    .eq('target_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
}

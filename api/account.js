// DELETE /api/account — removes the caller's own account.
//
// Deleting an auth user requires the service-role key, which bypasses row-level
// security completely. That key cannot be in the browser, so this is the only
// place the operation can live.
//
// The design decision that matters here is that the request carries no user id.
// The only identity involved is the one Supabase reports for the bearer token,
// so there is no field for anybody to change to somebody else's id. An
// administrator deleting another person's account is deliberately not
// implemented — see supabase/SECURITY.md; suspension (set_account_active) is
// the administrative operation, and it is reversible.
//
// Deleting the auth user cascades: every table in the schema references
// auth.users with `on delete cascade`, so mood logs, habits, habit logs,
// thought records, the profile row and class memberships all go with it.
//
// Environment:
//   SUPABASE_URL                required (or VITE_SUPABASE_URL). It must name
//                               the same project the browser signs in against;
//                               a mismatch between the two is refused outright
//                               (see _lib/auth.js supabaseRestConfig).
//   SUPABASE_SERVICE_ROLE_KEY   required. Without it this returns 503 and
//                               nothing is deleted. Never give it a VITE_
//                               prefix — that would inline it into the public
//                               bundle and hand every visitor full database
//                               access.

import { verifyCaller, readEnv, supabaseRestConfig, createRateLimiter, sendJson } from './_lib/auth.js'

export const config = { maxDuration: 30 }

// Account deletion is not something anyone does repeatedly. A low ceiling here
// costs a legitimate user nothing and makes the endpoint useless as a way to
// hammer the auth admin API.
const overRateLimit = createRateLimiter({ max: 3, windowMs: 60 * 60 * 1000 })

export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    res.setHeader('Allow', 'DELETE')
    return sendJson(res, 405, { error: 'Use DELETE.' })
  }

  const auth = await verifyCaller(req)
  if (!auth.ok) return sendJson(res, auth.status, { error: auth.message })

  if (overRateLimit(auth.userId)) {
    return sendJson(res, 429, { error: 'Too many attempts. Try again later.' })
  }

  // The same project the token was just verified against, resolved by the same
  // function — not a second, independent read of the environment. Resolving it
  // twice is how this endpoint could end up verifying a caller against one
  // project and then deleting a user with that id from another, which with the
  // service-role key is the one mistake here that destroys somebody's data.
  const config = supabaseRestConfig()
  const url = config?.url
  const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    // Saying plainly that it is not configured beats a generic failure: the
    // alternative is a user who believes their account is gone when it is not.
    return sendJson(res, 503, {
      error:
        'Account deletion is not configured for this deployment. Your data can still be deleted from Settings.',
    })
  }

  let response
  try {
    response = await fetch(`${url}/auth/v1/admin/users/${auth.userId}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('[account] delete request failed:', error?.message)
    return sendJson(res, 502, { error: 'Could not reach the auth server. Nothing was deleted.' })
  }

  if (!response.ok) {
    // The upstream body can name internal detail, so it goes to the log and not
    // to the caller.
    const detail = await response.text().catch(() => '')
    console.error(`[account] delete rejected ${response.status}: ${detail.slice(0, 300)}`)
    return sendJson(res, 502, { error: 'The account could not be deleted. Nothing was changed.' })
  }

  return sendJson(res, 200, { deleted: true })
}

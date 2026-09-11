// Shared server-side plumbing for the functions in api/.
//
// Vercel does not route files under a `_`-prefixed directory, so this is a
// module rather than an endpoint.
//
// Environment:
//   SUPABASE_URL / SUPABASE_ANON_KEY
//       Falls back to the VITE_-prefixed pair, which the build already needs,
//       so a Vercel project usually has these already. Both are public values.
//       If both pairs are set and name different projects, every endpoint here
//       fails closed — see supabaseRestConfig().
//   SUPABASE_SERVICE_ROLE_KEY
//       Optional, and read only by api/account.js. It bypasses row-level
//       security entirely. It must never gain a VITE_ prefix and must never be
//       returned in a response — a leaked service key is every user's data.

export function readEnv(...names) {
  for (const name of names) {
    const value = process.env[name]
    if (value) return value
  }
  return null
}

/**
 * The project ref out of a Supabase URL — the `abcd` in
 * https://abcd.supabase.co. Null for anything that is not one, including a
 * local stack on 127.0.0.1, which has no ref and needs none.
 */
function projectRef(url) {
  const match = /^https:\/\/([^./]+)\.supabase\.co$/i.exec(String(url ?? '').trim().replace(/\/$/, ''))
  return match ? match[1].toLowerCase() : null
}

/**
 * Which Supabase project this function talks to, and with which public key.
 *
 * The server-side pair wins and the VITE_ pair is the fallback, because the
 * build already needs the second — so a Vercel project usually has it and the
 * functions work without extra configuration.
 *
 * The check below is the point of this function rather than an extra. These two
 * pairs can name DIFFERENT PROJECTS, and if they do, the endpoint verifies a
 * token against one project while the browser holds a session from another.
 * Every token then fails and every request 401s — or, worse, the two projects
 * both have an account with the same id and the caller is verified as somebody
 * else entirely. It is a configuration mistake that produces no error message
 * of its own, which is exactly the kind worth turning into one: a mismatch
 * returns null here, and both endpoints answer 503 rather than guessing which
 * project was meant.
 */
export function supabaseRestConfig() {
  const url = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const key = readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
  if (!url || !key) return null

  const serverRef = projectRef(process.env.SUPABASE_URL)
  const clientRef = projectRef(process.env.VITE_SUPABASE_URL)
  if (serverRef && clientRef && serverRef !== clientRef) {
    console.error(
      `[auth] SUPABASE_URL (${serverRef}) and VITE_SUPABASE_URL (${clientRef}) are different projects. ` +
        'The browser signs in against one and this function would verify against the other. ' +
        'Point both at the same project, or unset SUPABASE_URL.'
    )
    return null
  }

  return { url: url.replace(/\/$/, ''), key }
}

export function bearerToken(req) {
  const header = req.headers.authorization ?? req.headers.Authorization ?? ''
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

/**
 * Who is calling, according to Supabase.
 *
 * Supabase's own userinfo endpoint is the cheapest honest way to check a token
 * from a serverless function: it validates the signature, the expiry, and the
 * fact that the user still exists, without this function holding a JWT secret.
 * Decoding the token here instead would check none of those things — an
 * unverified JWT is a claim, not a fact.
 *
 * @returns {Promise<{ok: true, userId: string, token: string, email: string|null}
 *                  | {ok: false, status: number, message: string}>}
 */
export async function verifyCaller(req) {
  const token = bearerToken(req)
  if (!token) return { ok: false, status: 401, message: 'Sign in first.' }

  const config = supabaseRestConfig()
  if (!config) {
    // Failing closed: an endpoint that cannot identify its caller must not do
    // work on their behalf, whatever that work costs.
    return { ok: false, status: 503, message: 'This deployment is not configured for that.' }
  }

  let response
  try {
    response = await fetch(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.key, Authorization: `Bearer ${token}` },
    })
  } catch {
    return { ok: false, status: 502, message: 'Could not verify your session.' }
  }

  if (!response.ok) {
    return { ok: false, status: 401, message: 'Your session has expired. Sign in again.' }
  }

  const user = await response.json().catch(() => null)
  if (!user?.id) return { ok: false, status: 401, message: 'Your session has expired. Sign in again.' }
  return { ok: true, userId: user.id, token, email: user.email ?? null }
}

/**
 * Call a Postgres function as the caller, not as this server.
 *
 * The point is the "as the caller" part: the request carries their access
 * token, so row-level security and the function's own authorisation checks
 * apply exactly as they would from the browser. That is what makes it safe to
 * use the answer as an authorisation decision here.
 */
export async function callRpcAsUser(token, fn, args = {}) {
  const config = supabaseRestConfig()
  if (!config) return { data: null, error: { message: 'Not configured.' } }

  let response
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    })
  } catch {
    return { data: null, error: { message: 'Could not reach the database.' } }
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    return { data: null, error: { message: body?.message ?? `rpc ${fn} failed` } }
  }
  return { data: body, error: null }
}

/**
 * A per-user, per-instance rate limit.
 *
 * In memory, so it resets on a cold start and is not shared between instances —
 * a speed bump against a loop, not a billing control. Put a real limiter in
 * front of these functions if the app ever has more than a few users.
 */
export function createRateLimiter({ max, windowMs, maxKeys = 500 }) {
  const seen = new Map()

  return function overLimit(key) {
    const now = Date.now()
    const calls = (seen.get(key) ?? []).filter((t) => now - t < windowMs)
    if (calls.length >= max) {
      seen.set(key, calls)
      return true
    }
    calls.push(now)
    seen.set(key, calls)

    if (seen.size > maxKeys) {
      for (const [otherKey, times] of seen) {
        if (!times.some((t) => now - t < windowMs)) seen.delete(otherKey)
      }
    }
    return false
  }
}

/**
 * Answer with JSON and without a cache.
 *
 * Every response from api/ is about one signed-in person. `no-store` keeps it
 * out of the browser cache, out of any shared proxy, and off Vercel's edge —
 * the failure mode being one user handed another user's report.
 */
export function sendJson(res, status, body) {
  res.setHeader('Cache-Control', 'no-store, private')
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  return res.status(status).json(body)
}

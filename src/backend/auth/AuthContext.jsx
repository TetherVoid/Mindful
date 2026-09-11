import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase, isFixtureMode } from '@backend/database/client'
import { getStoredUtm } from '@backend/utils/utm'
import { getMyProfile, ROLES } from '@backend/services/profile'
import { assertUsablePassword } from './password'
import { authRedirectUrl, oauthProviders } from '@config/env'

const AuthContext = createContext(null)

// The providers this file knows how to start. A name arriving from anywhere
// else is refused rather than passed through to signInWithOAuth, because that
// argument ends up in a redirect URL.
const SUPPORTED_PROVIDERS = Object.freeze(['google', 'apple'])

// Only these five keys are ever sent as signup metadata. getStoredUtm() reads
// localStorage, which the user can edit, and everything it returns is copied
// into raw_user_meta_data — a JSON blob the signup trigger reads. The trigger
// already ignores anything that is not a UTM value and hard-codes the role, so
// this is the second of two locks on the same door.
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']

function signupMetadata() {
  const stored = getStoredUtm()
  const safe = {}
  for (const key of UTM_KEYS) {
    const value = stored?.[key]
    if (typeof value === 'string' && value) safe[key] = value.slice(0, 200)
  }
  return safe
}

// Where a provider or an email link sends the browser back to.
//
// The default is this origin's /auth/callback, which is a real route (see
// app/App.jsx) whose only job is to wait for supabase-js to finish exchanging
// the `?code=` for a session and then send the user on. Landing on `/` instead
// worked, but it put the code exchange behind RootRedirect, which decides where
// to go from a session that has not arrived yet — so a returning user could be
// bounced to /login for the moment it took to settle.
//
// VITE_AUTH_REDIRECT_URL overrides it, because Supabase matches this against
// the project's redirect allow-list and a preview deployment does not share an
// origin with production. Whatever is set there must be on that allow-list, and
// should end in /auth/callback for the same reason the default does.
function redirectTarget() {
  if (authRedirectUrl) return authRedirectUrl
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}/auth/callback`
}

// An OAuth provider that refuses reports back in the query string, not by
// failing the request — `?error=access_denied&error_description=...`. Without
// this the browser lands on a sign-in page with no session and no explanation.
//
// Read once per page load and cached at module scope, so it survives being the
// initial value of a useState and is not re-read on a remount. StrictMode
// mounts every provider twice in development; without the cache the second
// mount would find an address bar this code had already cleaned and conclude
// nothing had gone wrong.
let capturedOAuthError

function readOAuthErrorFromUrl() {
  if (capturedOAuthError !== undefined) return capturedOAuthError
  capturedOAuthError = null

  if (typeof window === 'undefined') return null
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code = search.get('error') ?? hash.get('error')
  if (!code) return null

  const description = search.get('error_description') ?? hash.get('error_description')
  capturedOAuthError = description
    ? decodeURIComponent(description.replace(/\+/g, ' '))
    : `Sign-in failed (${code}).`
  return capturedOAuthError
}

// Clearing the address bar is a separate step from reading it: a refresh should
// not resurrect the message, and the error text should not travel on in a
// Referer header to whatever the page loads next.
function clearOAuthErrorFromUrl() {
  if (typeof window === 'undefined') return
  if (!/[?#].*error/.test(window.location.href)) return
  window.history.replaceState({}, '', window.location.pathname)
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(readOAuthErrorFromUrl)
  const mounted = useRef(true)

  // The profile is fetched per user id, not per session object. Supabase emits
  // TOKEN_REFRESHED with a fresh session roughly every hour; refetching the
  // role on each of those would be a query an hour per open tab for an answer
  // that almost never changes.
  const loadedFor = useRef(null)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      loadedFor.current = null
      setProfile(null)
      return
    }
    if (loadedFor.current === userId) return
    loadedFor.current = userId

    const { data, error } = await getMyProfile()
    if (!mounted.current) return
    if (error) {
      // A profile that will not load is not a reason to break the app: every
      // query is still gated by RLS, and the least-privileged reading of an
      // unknown profile is a student with no extra powers. Say so in the
      // console and carry on.
      console.warn('[auth] Could not read profile:', error.message)
      setProfile(null)
      return
    }

    // A suspended account keeps its session cookie until it is used. Ending it
    // here means suspension takes effect on the next page load rather than
    // whenever the token happens to expire.
    if (data?.deactivated_at) {
      setProfile(null)
      setAuthError('This account has been deactivated. Contact your administrator.')
      await supabase.auth.signOut()
      return
    }
    setProfile(data)
  }, [])

  useEffect(() => {
    mounted.current = true

    clearOAuthErrorFromUrl()

    // getSession() resolves after supabase-js has finished its own boot work,
    // which includes exchanging an OAuth `?code=` for a session. Reading it
    // first is therefore also how the callback is awaited — there is no window
    // in which a redirect back from Google looks like a signed-out visitor.
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted.current) return
      if (error) setAuthError(error.message)
      setSession(data?.session ?? null)
      await loadProfile(data?.session?.user?.id ?? null)
      if (mounted.current) setLoading(false)
    }).catch((err) => {
      // Nothing below getSession() is allowed to leave the app stuck on its
      // loading screen. A session that cannot be read is a signed-out visitor.
      if (!mounted.current) return
      console.warn('[auth] Could not read session:', err?.message ?? err)
      setSession(null)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted.current) return
      setSession(newSession)
      if (event === 'SIGNED_OUT') {
        loadedFor.current = null
        setProfile(null)
        return
      }
      // Deliberately not awaited inside the callback: supabase-js holds a lock
      // while it runs, and another client call made from in here can deadlock
      // against it. Deferring to a microtask releases the lock first.
      void Promise.resolve().then(() => loadProfile(newSession?.user?.id ?? null))
    })

    return () => {
      mounted.current = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const refreshProfile = useCallback(async () => {
    loadedFor.current = null
    await loadProfile(session?.user?.id ?? null)
  }, [loadProfile, session?.user?.id])

  async function signUp(email, password) {
    assertUsablePassword(password)
    // UTM values ride along as auth user metadata; a DB trigger (see
    // supabase/schema.sql) copies them into `profiles` server-side. Doing it
    // there instead of a client-side insert avoids RLS rejecting the write
    // when "Confirm email" is on and there's no session yet.
    //
    // Nothing in this metadata decides anything. The trigger hard-codes the new
    // account's role to 'student' and never reads a role from here — this blob
    // is whatever the browser chose to send, which makes it evidence of a
    // campaign click and not of authority.
    const { data, error } = await supabase.auth.signUp({
      email: String(email ?? '').trim(),
      password,
      options: { data: signupMetadata(), emailRedirectTo: redirectTarget() },
    })
    if (error) throw error
    return data
  }

  async function signIn(email, password) {
    setAuthError(null)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email ?? '').trim(),
      password,
    })
    if (error) throw error
    return data
  }

  /**
   * Start a third-party sign-in. Returns once the browser has been handed to
   * the provider; the session arrives on the way back, via the code exchange
   * that supabase-js performs during the next boot.
   */
  async function signInWithOAuth(provider) {
    const name = String(provider ?? '').toLowerCase()
    if (!SUPPORTED_PROVIDERS.includes(name)) {
      throw new Error(`${provider} is not a sign-in method this app supports.`)
    }
    if (isFixtureMode) {
      throw new Error('Third-party sign-in needs a real Supabase project; this is sample data.')
    }
    setAuthError(null)

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: name,
      options: {
        redirectTo: redirectTarget(),
        // Apple returns the account's name only on the very first consent, and
        // only if it is asked for. Ask on both, so the profile has something to
        // show besides an email address.
        scopes: name === 'apple' ? 'name email' : undefined,
      },
    })
    if (error) throw error
    return data
  }

  const signInWithGoogle = () => signInWithOAuth('google')
  const signInWithApple = () => signInWithOAuth('apple')

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    loadedFor.current = null
    setProfile(null)
    if (error) throw error
  }

  async function updatePassword(newPassword) {
    assertUsablePassword(newPassword)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }

  /**
   * Send a reset link.
   *
   * Resolves the same way whether or not the address has an account. Supabase
   * behaves that way on purpose and so does this: a reset form that says "no
   * such user" tells anyone who asks which addresses are registered.
   */
  async function requestPasswordReset(email) {
    const address = String(email ?? '').trim()
    if (!address) throw new Error('Enter the email address you signed up with.')
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: redirectTarget(),
    })
    if (error) throw error
    return true
  }

  const role = profile?.role ?? ROLES.student

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    authError,
    clearAuthError: () => setAuthError(null),

    // Authorisation, for rendering only. Every one of these is re-decided by
    // the database on every query — hiding a button is a courtesy, not a
    // control.
    profile,
    role,
    isStudent: role === ROLES.student,
    isTeacher: role === ROLES.teacher || role === ROLES.admin,
    isAdmin: role === ROLES.admin,
    refreshProfile,

    signUp,
    signIn,
    signOut,
    updatePassword,
    requestPasswordReset,

    // Which third-party buttons this deployment should offer. Empty unless
    // VITE_OAUTH_PROVIDERS lists them AND they are configured in Supabase.
    oauthProviders: oauthProviders.filter((name) => SUPPORTED_PROVIDERS.includes(name)),
    signInWithOAuth,
    signInWithGoogle,
    signInWithApple,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

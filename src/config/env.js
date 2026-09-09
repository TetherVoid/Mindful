// The only place in the app that reads import.meta.env.
//
// Centralised so the public/private boundary is auditable in one file: every
// VITE_-prefixed value below is inlined into the client bundle and is therefore
// public. A secret must never gain a VITE_ prefix — server-only values are read
// from process.env inside api/, never here.
//
// Owned by the backend agent (see AGENT_RULES.md).

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Gated on MODE rather than DEV: `vite build` folds DEV to false whatever mode
// it is given, which would strip the fixtures branch from a deliberate
// `--mode development` build too. MODE is the literal mode string, so a real
// production build (mode 'production') can never switch fixtures on, while
// `vite build --mode development` still can.
export const useFixtures =
  import.meta.env.MODE !== 'production' && import.meta.env.VITE_USE_FIXTURES === 'true'

export const fixtureScenario = import.meta.env.VITE_FIXTURE_SCENARIO
export const fixtureStartsSignedIn = import.meta.env.VITE_FIXTURE_SIGNED_OUT !== 'true'
export const fixtureLatencyMs = Number(import.meta.env.VITE_FIXTURE_LATENCY ?? 220)

// --- Authentication ---------------------------------------------------------

// Where an OAuth provider sends the browser back to. Supabase requires the
// value to be on the project's redirect allow-list, so it is configurable
// rather than always derived from window.location — a preview deployment and
// production do not share an origin.
//
// Public by design: it is a URL the user's own browser is about to visit.
export const authRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL

// Which third-party sign-in buttons the UI should offer, e.g. "google,apple".
// Listing a provider here does nothing on its own — it must also be enabled and
// configured in the Supabase dashboard (see supabase/OAUTH.md). This exists so
// the sign-in page can hide a button for a provider this deployment has not set
// up, rather than showing one that fails on click.
export const oauthProviders = String(import.meta.env.VITE_OAUTH_PROVIDERS ?? '')
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean)

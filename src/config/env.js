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

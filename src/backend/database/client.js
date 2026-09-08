import { createClient } from '@supabase/supabase-js'
import { createMockClient } from './mockClient'
import { supabaseUrl, supabaseAnonKey, useFixtures, fixtureScenario, fixtureStartsSignedIn, fixtureLatencyMs } from '@config/env'

// The Supabase client, and the local stand-in that replaces it.
//
// Local development can run against seeded fixtures instead of a real project,
// so the UI is workable (and reviewable) without credentials. Opt in with
// VITE_USE_FIXTURES=true; see .env.example. The MODE-not-DEV gate that makes a
// production build immune to this lives in @config/env.
//
// Nothing outside backend/ should import this module. Pages and components go
// through backend/services/* instead — see AGENT_RULES.md.

function createRealClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local, ' +
        'or set VITE_USE_FIXTURES=true to run against local sample data.'
    )
  }
  return createClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = useFixtures
  ? createMockClient(fixtureScenario, {
      startSignedIn: fixtureStartsSignedIn,
      latencyMs: fixtureLatencyMs,
    })
  : createRealClient()

// True when the app is running on seeded fixtures rather than a real project.
// Services and the report client branch on this rather than sniffing the client
// object, which keeps the check readable at the call site.
export const isFixtureMode = Boolean(supabase.__isFixtureClient)

if (useFixtures) {
  console.info(
    `[fixtures] Running on local sample data (scenario: ${fixtureScenario || 'week'}). ` +
      'No Supabase project is being contacted.'
  )
}

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
  // The auth options are all spelled out rather than left to the library's
  // defaults, because three of them are security decisions and a default can
  // change under you between minor versions:
  //
  //   flowType: 'pkce'        the authorization-code flow with a proof key. The
  //                           alternative, 'implicit', puts the access token in
  //                           the URL fragment, where it lands in history and in
  //                           any Referer a third-party asset triggers. PKCE
  //                           returns a single-use code instead, and the code is
  //                           worthless without the verifier held in this tab.
  //   detectSessionInUrl      required by the above: it is what exchanges the
  //                           code for a session when the provider redirects
  //                           back, and then strips it from the address bar.
  //   autoRefreshToken        access tokens are short-lived on purpose; without
  //                           this a long session silently starts failing RLS
  //                           checks rather than staying signed in.
  //
  // PKCE is not the library's default — supabase-js still defaults to
  // 'implicit' — so this is a deliberate change with one cost worth stating:
  // the code verifier lives in the localStorage of the browser that started the
  // flow, so a confirmation or password-reset link opened in a DIFFERENT
  // browser than the one it was requested from cannot complete. Signing up on a
  // laptop and confirming from a phone stops working. That is the accepted
  // trade for keeping access tokens out of URLs, browser history and Referer
  // headers; if it turns out to matter for this audience, the way back is this
  // one line, not a workaround elsewhere.
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  })
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

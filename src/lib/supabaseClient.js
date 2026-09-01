import { createClient } from '@supabase/supabase-js'
import { createMockClient } from './mockSupabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Local development can run against seeded fixtures instead of a real project,
// so the UI is workable (and reviewable) without credentials. Opt in with
// VITE_USE_FIXTURES=true; see .env.example.
//
// Gated on MODE rather than DEV: `vite build` folds DEV to false whatever mode
// it is given, which would strip this branch from a deliberate
// `--mode development` build too. MODE is the literal mode string, so a real
// production build (mode 'production') can never switch fixtures on, while
// `vite build --mode development` still can.
const useFixtures =
  import.meta.env.MODE !== 'production' && import.meta.env.VITE_USE_FIXTURES === 'true'

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
  ? createMockClient(import.meta.env.VITE_FIXTURE_SCENARIO, {
      startSignedIn: import.meta.env.VITE_FIXTURE_SIGNED_OUT !== 'true',
    })
  : createRealClient()

if (useFixtures) {
  console.info(
    `[fixtures] Running on local sample data (scenario: ${
      import.meta.env.VITE_FIXTURE_SCENARIO || 'week'
    }). No Supabase project is being contacted.`
  )
}

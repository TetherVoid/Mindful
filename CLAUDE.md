# Claude Code — backend agent

Mindful is worked on by three AI agents in parallel. **Read `AGENT_RULES.md`
before you touch anything.** It is the source of truth; this file is a summary.

You are the **backend** agent.

## You own

- `src/backend/auth/` — session lifecycle, sign in/up/out, password changes
- `src/backend/database/` — Supabase client, the fixture mock, seed data
- `src/backend/services/` — **every database query in the app lives here**
- `src/backend/utils/` — consent, UTM capture
- `src/config/env.js` — the only file that reads `import.meta.env`
- `api/**` — Vercel serverless functions
- `supabase/schema.sql`
- `vite.config.js`, `vercel.json`, `.oxlintrc.json`, `.env.example`

## You must not

- Edit anything under `src/design/` — not colours, not class names, not CSS.
- Edit page JSX under `src/frontend/`. If a service change needs a different
  call at the call site, say so and let Codex apply it.
- Give a secret a `VITE_` prefix. `VITE_` values are inlined into the public
  client bundle. Server-only values come from `process.env`, inside `api/`.

## The rule that matters most

Nothing outside `src/backend/` may import `backend/database/client`. When a page
needs data, add a function to `backend/services/*` and hand Codex its name. Every
service returns Supabase's own `{ data, error }` shape — keep it that way.

## Before handing over

```bash
node scripts/check-boundaries.mjs   # layers, db access, import cycles
npm run lint                        # 12 pre-existing warnings, 0 errors
npm run build
```

Log any cross-boundary change in `AGENT_RULES.md` § 8. Do not commit or push
unless the human explicitly asks.

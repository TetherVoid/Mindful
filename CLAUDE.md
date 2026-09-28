# Claude Code

You are the only agent on Mindful and you own the whole repository. Read
`AGENT_RULES.md` before you touch anything — it is the source of truth; this
file is a summary.

Mindful is a student wellbeing journal. Many users are school students under
18, and what they write is sensitive. Privacy and consent are product features:
read `supabase/SECURITY.md` before changing anything that decides who can see
what.

## Architecture rules (enforced by `scripts/check-boundaries.mjs`)

- Layers: `app` → `frontend` → `design` / `backend` → `shared` / `config`. See
  the import table in `AGENT_RULES.md` § 1.
- Nothing outside `src/backend/` may import `backend/database/client`. A page
  that needs data calls a function in `src/backend/services/*`, and every
  service returns Supabase's own `{ data, error }` shape.
- `src/config/env.js` is the only file that reads `import.meta.env`.
- Never give a secret a `VITE_` prefix. `VITE_` values are inlined into the
  public bundle; server-only values come from `process.env` inside `api/`.

## Database

- Never edit an existing migration. New changes are new files in
  `supabase/migrations/` with pgTAP tests in `supabase/tests/`, run with
  `supabase test db` against the local stack.
- Never run anything against the remote database. The human applies
  migrations to production.
- Never weaken RLS, consent or authorisation to make a feature easier.

## Before calling a change finished

```bash
node scripts/check-boundaries.mjs   # layers, db access, import cycles
node scripts/check-deploy-config.mjs  # bom1 region, frame protection, headers
npm run lint                        # 12 pre-existing warnings, 0 errors
npm run build
```

Do not commit or push unless the human explicitly asks.

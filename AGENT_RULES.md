# Project rules

Mindful has one agent, Claude Code, which owns the whole repository. This file
is the full rulebook; `CLAUDE.md` is the always-loaded summary and `AGENTS.md`
points other agents here. On access control, `supabase/SECURITY.md` wins. The
pre-2026-09-25 change log is in `docs/archive/three-agent-changelog.md`.

## 1. Architecture

Vite + React 19, plain JavaScript (no TypeScript), plain CSS (no Tailwind),
Supabase for auth and data, Vercel serverless functions in `api/`.

```
src/app/       composition root — main, routes, providers
src/frontend/  pages, layouts, components, page content
src/design/    tokens, theme, stylesheets, visual primitives, assets
src/backend/   auth, database client, services, backend utils
src/shared/    constants, contracts, pure utils — depends on nothing
src/config/    the only reader of import.meta.env
api/           Vercel functions (must stay at repo root)
supabase/      migrations, pgTAP tests, SECURITY.md, MIGRATIONS.md
scripts/       check-boundaries, check-deploy-config, verify, hooks/
tests/         node tests: /api/report stub, the guard hooks
```

| Layer | May import |
|---|---|
| `app` | everything |
| `frontend` | `design`, `backend`, `shared` |
| `design` | `shared` |
| `backend` | `shared`, `config` |
| `shared`, `config` | nothing |

`scripts/check-boundaries.mjs` enforces the table, direct database access and
import cycles. The two rules that matter most:

- **`design/` may not import `frontend/`.** A primitive that needs page state
  takes it as a prop; data it renders lives in `shared/constants/`.
- **Nothing outside `backend/` imports `backend/database/client`.** Pages call
  `backend/services/*`, and every service returns Supabase's own
  `{ data, error }` shape, so pages learn one error style.

Aliases `@app @frontend @design @backend @shared @config` are declared in
`vite.config.js` and mirrored in `jsconfig.json`. Keep the two in sync.

## 2. Rules that must stay true

- **No secret gets a `VITE_` prefix.** `VITE_` values are inlined into the
  public bundle. Server-only values come from `process.env` inside `api/`.
  `src/config/env.js` is the only file that reads `import.meta.env`.
- **Access control lives in the database.** RLS and `SECURITY DEFINER`
  functions decide who reads what; the UI only decides what to offer. Read
  `supabase/SECURITY.md` before touching a policy, grant or definer function.
  Never widen one to make a feature easier.
- **Database changes are new migrations.** Never edit a committed file in
  `supabase/migrations/`. Each new one ships with pgTAP tests in
  `supabase/tests/`, run locally with `supabase test db --local`.
- **Nothing remote without the human's "go".** No push, no command against the
  production database, no deploy or Vercel env change. Claude prepares an
  approval packet; the human runs the commands.
- **`shared/` is additive.** Adding a constant or contract field is free;
  renaming or removing one means finding every reader first.

## 3. Files coupled on purpose

- **`index.html`'s pre-paint script** duplicates `design/tokens/palette.js` (it
  runs before React and cannot import). Change the colour maths in both. Its
  storage keys are listed in `shared/constants/storage.js`.
- **CSS class names** are the markup↔stylesheet contract. Rename both together.
- **`design/styles/app.css` `@import` order** is cascade order;
  `23-responsive.css` stays last.
- **`vercel.json`**: the `/((?!api/).*)` rewrite must not be broadened (it
  would shadow `/api/*`); functions stay in `bom1`; frame-protection headers
  stay. `scripts/check-deploy-config.mjs` checks all three.
- **`shared/constants/limits.js`** mirrors the CHECK constraints in
  `20260927000100_text_limits_and_insert_quotas.sql`. Change both together.
- **`api/_lib/figures.js`** allowlists every string `/api/report` may forward.
  A new text field in `services/report/insights.js` must be added there.
- **`src/app/providers.jsx`**: `ThemeProvider` sits outside `AuthProvider` so
  signed-out visitors keep their theme.
- **`frontend/pages/Settings.jsx`** composes `@backend/services/account` and
  `@design/theme/AppearanceSettings`. New settings go in the owning layer.

## 4. Dependencies and shapes

Install with `npm install`, never by hand-editing `package.json`. Client
packages must earn their bundle weight. A package used only by `api/` is still
a normal dependency (Vercel installs from the same manifest).
`shared/contracts/index.js` holds JSDoc `@typedef`s. Nothing enforces them,
so keep them accurate when a service's return shape changes.

## 5. Workflow and checks

`.claude/` holds the tracked workflow: agents `explorer` (haiku), `planner`
(opus), `reviewer` (sonnet), `gated-reviewer` (opus); skills `task-workflow`,
`approval-packet`, `deploy-order`, `migration-checklist`; and hooks
(`scripts/hooks/`, tested in `tests/guards.test.mjs`) that block edits to
committed migrations, anything remote, and edits to the guards themselves. The
guard files are the human's: Claude proposes changes and the human makes them.

```bash
npm run verify    # boundaries, deploy config, lint ratchet, build, tests,
                  # pgTAP when the local stack is up. Must be green.
```

Lint is a ratchet: 0 errors, and warnings may not exceed
`scripts/lint-baseline.json` (11 today). The baseline only goes down.

Run the app on seeded data, no Supabase needed:

```bash
VITE_USE_FIXTURES=true VITE_FIXTURE_SCENARIO=heavy npm run dev  # empty | week | heavy
```

Commit locally at the end of a task. Never push; that is the human's call.

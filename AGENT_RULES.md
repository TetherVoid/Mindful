# Project rules

Mindful has one agent, Claude Code, which owns the whole repository. This file
is the source of truth for how the code is laid out and what must stay true.
`CLAUDE.md` and `AGENTS.md` are short pointers at it — if they ever disagree
with it, this document wins.

The layer rules below are architecture, not ownership, and they are enforced by
a script. Run it before calling any change finished:

```bash
node scripts/check-boundaries.mjs
```

It fails on layer violations, direct database access from outside `backend/`,
and import cycles. A rule nobody can check is a rule that quietly stops being
true.

---

## 1. Architecture

Vite + React 19, plain JavaScript (no TypeScript), plain CSS (no Tailwind),
Supabase for auth and data, Vercel serverless functions in `api/`.

```
src/
├── app/            composition root — main, routes, providers. Where the layers meet.
├── frontend/       pages, layouts, components, page content
├── design/         tokens, theme, stylesheets, visual primitives, assets
├── backend/        auth, database client, services, backend utils
├── shared/         constants, contracts, pure utils — depends on nothing
└── config/         the only reader of import.meta.env

api/                Vercel serverless functions (must stay at repo root)
supabase/           migrations, pgTAP tests, schema.sql, SECURITY.md
scripts/            repo tooling, incl. check-boundaries.mjs
```

### Which layer may import which

Enforced by `scripts/check-boundaries.mjs`.

| Layer | May import |
|---|---|
| `app` | everything (it is the composition root) |
| `frontend` | `design`, `backend`, `shared` |
| `design` | `shared` |
| `backend` | `shared`, `config` |
| `shared` | nothing |
| `config` | nothing |

Two rules fall out of that table and matter more than the rest:

- **`design/` may not import `frontend/`.** A visual primitive that needs page
  state is not a primitive. Pass it in as a prop. Data a primitive needs to
  render (the support line, say) lives in `shared/constants/`.
- **Nothing outside `backend/` may import `backend/database/client`.** Pages and
  components call `backend/services/*` instead. Every database query in the app
  lives in a service.

### Path aliases

`@app @frontend @design @backend @shared @config`, declared in `vite.config.js`
and mirrored in `jsconfig.json`. Keep the two files in sync.

They exist so a layer crossing is visible at the import line: `@backend/...`
inside a `frontend/` file says *this reaches into another layer*, where
`../../lib/thing` would have said nothing.

### How data flows

```
frontend/pages/Habits.jsx
  └─ @backend/services/habits
       └─ backend/database/client
            └─ Supabase  (or the fixture client, in local dev)
```

Every service returns Supabase's own `{ data, error }` shape. That is
deliberate: a page never has to learn a second error-handling style, and a query
can move behind a service one line at a time.

---

## 2. Rules that must stay true

- **No secret gets a `VITE_` prefix.** `VITE_` values are inlined into the
  public client bundle. Server-only values are read from `process.env`, inside
  `api/`. `src/config/env.js` is the only file that reads `import.meta.env`.
- **Access control lives in the database.** RLS policies and `SECURITY
  DEFINER` functions decide who reads what; the UI only decides what to offer.
  Read `supabase/SECURITY.md` before touching a policy, a grant or a definer
  function, and never widen one to make a feature easier.
- **Database changes are new migrations.** Never edit an existing file in
  `supabase/migrations/`. Every new migration ships with pgTAP tests in
  `supabase/tests/` and is run with `supabase test db` against the local stack.
  Migrations are applied to production by the human, never from here.
- **`shared/` is additive.** Adding a constant or a contract field is free;
  renaming or removing one means finding every reader first.

---

## 3. Files that are coupled on purpose

**`index.html`'s pre-paint script** duplicates `design/tokens/palette.js` — it
applies the saved palette before React boots, which is the only way to avoid a
flash of default colour, and it cannot import a module. Change the colour maths
in one, change it in the other. The storage keys it reads are listed in
`shared/constants/storage.js`.

**CSS class names** are the contract between markup and stylesheet, with no file
to lock. Rename a class in the JSX and the stylesheet together.

**`design/styles/app.css`'s `@import` order** is cascade order.
`23-responsive.css` must stay last.

**`vercel.json`'s `/((?!api/).*)` rewrite** must not be broadened — widening it
shadows `/api/*`.

**`src/app/providers.jsx`**: provider order is load-bearing. `ThemeProvider`
sits outside `AuthProvider` so a signed-out visitor still gets their theme.

**`frontend/pages/Settings.jsx`** composes `@backend/services/account` and
`@design/theme/AppearanceSettings`. A new setting belongs in whichever layer
owns its logic, not inlined back into the page.

---

## 4. Dependencies and shared shapes

**Dependencies.** Install with `npm install`, never by editing `package.json` by
hand. Client-side packages must earn their place in the bundle. A package used
only by `api/` is still a normal dependency, because Vercel installs from the
same manifest.

**Shared shapes.** There is no TypeScript, so `shared/contracts/index.js` holds
JSDoc `@typedef`s: documentation with a machine-readable shape that editors
resolve. Nothing enforces them, so keep them accurate when a service's return
shape changes.

---

## 5. Before calling a change finished

```bash
node scripts/check-boundaries.mjs   # layers, database access, cycles
npm run lint                        # 12 pre-existing warnings, no errors
npm run build                       # must succeed
supabase test db                    # when a migration changed (local stack)
```

Run the app on seeded data — no Supabase project or credentials needed:

```bash
VITE_USE_FIXTURES=true VITE_FIXTURE_SCENARIO=heavy npm run dev
```

Scenarios are `empty` (day one, every list empty — the hardest case for layout),
`week`, and `heavy` (200+ records, long strings). Do not commit or push unless
the human asks.

---

## Archive: change log from the three-agent period

Until 2026-09-25 this repository was split between three agents (Claude Code
for the backend, Codex for the frontend, Antigravity for design), and every
change that crossed an ownership line was logged here. That split and the
logging requirement have ended. The entries are kept, unmaintained, because
several of them record *why* a value is what it is.

- 2026-09-18 · type and spacing scales. `tokens/tokens.css` gained
  `--text-3xs … --text-xl` (8 steps) and `--space-1 … --space-8` (8 steps);
  22 sheets were rewritten to read them (292 literal values became tokens,
  `font-size` and spacing properties only). The spacing grid is a quarter-rem
  run because half of all spacing already landed on it. Twelve values stay
  literal by decision: `0.5rem` on `.gauge-label` at ≤640px (snapping it would
  delete the responsive shrink); `1.6 / 1.85 / 2.0 / 2.6rem` (one-off display
  sizes); everything from `3.25rem` up (page rhythm); `1.75rem` (held until
  `/classes` and `/admin` could be seen rendered); minimums inside `clamp()`.
  Negative margins stay literal. Still open then: `1.75rem` (6 sites) and
  `.swatch-custom`'s hardcoded gradient.
- 2026-09-18 · `/classes` and `/admin` visual fixes. New part
  `24-classes-and-the-register-of-hands.css` (imported above
  `23-responsive.css`). `--danger-contrast` added in both themes because
  `.btn--danger:hover` used `#fff` at 3.17:1 on dark `--danger`, and
  `--accent-contrast` could not be reused (it is re-derived from a custom
  accent while `--danger` is fixed, which would drop it to 2.64:1). A `cohort`
  glyph added so `/habits` and `/classes` stopped sharing an icon. `Admin.jsx`
  moved to `.ledger-controls` (the rail class overflowed on narrow viewports).
  `Classes.jsx` reformatted from ~1,900-character lines, verified
  byte-identical after collapsing whitespace. `ConfirmModal.jsx` traps Tab and
  restores focus.
- 2026-09-11 · admin page, roster visibility, deactivation. `Admin.jsx` and an
  `isAdmin`-guarded `/admin` route (UX only; the database refuses everyone
  else). `Classes.jsx` calls `listClassRoster` beside `loadClassOverview` so
  "nobody enrolled" and "nobody shared" differ. Settings' teacher-visibility
  control is disabled until the profile loads and omits the field rather than
  writing `false`. Auth redirect defaults to `<origin>/auth/callback`.
  `supabaseRestConfig()` refuses mismatched `SUPABASE_URL` /
  `VITE_SUPABASE_URL` projects. Mumbai recorded as production, Seoul as
  deprecated.
- 2026-09-09 · roles/classes schema: four table names added to
  `shared/constants/tables.js`; `Profile`, `ClassRoom`, `StudentOverview`
  typedefs; `useAuth()` gained `profile`, `role`, `isStudent`, `isTeacher`,
  `isAdmin`, `refreshProfile`, `authError`, `requestPasswordReset`,
  `oauthProviders` and the OAuth helpers.
- 2026-09-08 · repository reorganised into
  `app/frontend/design/backend/shared/config`; 28 database calls moved out of
  pages into `backend/services/*`; `App.css` split into 23 part files; a
  `utm.js ↔ consent.js` import cycle broken by extracting
  `backend/utils/consentStore.js`.

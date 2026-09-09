# Agent rules

Mindful is worked on by three AI coding agents at once. This file is the single
source of truth for who owns what. `CLAUDE.md`, `AGENTS.md` and
`.antigravity/rules.md` are short pointers at this document — if they ever
disagree with it, this document wins.

| Agent | Role | Owns |
|---|---|---|
| **Claude Code** | Backend | `src/backend/`, `api/`, `supabase/`, `src/config/` |
| **Codex** | Frontend | `src/frontend/`, `src/app/` |
| **Antigravity** | Design | `src/design/` |

Run `node scripts/check-boundaries.mjs` before you hand work over. It fails on
layer violations, direct database access from outside `backend/`, and import
cycles. A rule nobody can check is a rule that quietly stops being true.

---

## 1. Architecture

Vite + React 19, plain JavaScript (no TypeScript), plain CSS (no Tailwind),
Supabase for auth and data, one Vercel serverless function.

```
src/
├── app/            composition root — main, routes, providers. Where the three layers meet.
├── frontend/       pages, layouts, components, page content
├── design/         tokens, theme, stylesheets, visual primitives, assets
├── backend/        auth, database client, services, backend utils
├── shared/         constants, contracts, pure utils — depends on nothing
└── config/         the only reader of import.meta.env

api/                Vercel serverless functions (must stay at repo root)
supabase/           schema.sql — tables, RLS policies, signup trigger
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
  state is not a primitive. Pass it in as a prop.
- **Nothing outside `backend/` may import `backend/database/client`.** Pages and
  components call `backend/services/*` instead. This is the rule that keeps
  Claude and Codex off each other's work.

### Path aliases

`@app @frontend @design @backend @shared @config`, declared in `vite.config.js`
and mirrored in `jsconfig.json`.

They exist so a boundary crossing is visible at the import line. `@backend/...`
inside a `frontend/` file says *this change reached across an ownership line*,
where `../../lib/thing` would have said nothing. Keep the two files in sync;
adding an alias is a cross-agent change.

### How data flows

```
frontend/pages/Habits.jsx        ← Codex owns the page
  └─ @backend/services/habits    ← Claude owns the query
       └─ backend/database/client
            └─ Supabase  (or the fixture client, in local dev)
```

Every service returns Supabase's own `{ data, error }` shape. That is
deliberate: a page never has to learn a second error-handling style, and a query
can move behind a service one line at a time.

---

## 2. What each agent owns

### Claude Code — backend

**Owns**

- `src/backend/auth/` — `AuthContext`, session lifecycle, sign in/up/out, password
- `src/backend/database/` — the Supabase client, the fixture mock, the seed data
- `src/backend/services/` — every database query in the app
- `src/backend/utils/` — consent, UTM capture
- `src/config/env.js` — the only file that reads `import.meta.env`
- `api/**` — Vercel serverless functions
- `supabase/schema.sql` — tables, RLS, triggers
- `vite.config.js`, `vercel.json`, `.oxlintrc.json`, `.env.example`

**Must not**

- Edit anything under `src/design/`. Not colours, not class names, not
  stylesheets — not even to make a backend feature look right.
- Edit page JSX. If a service change needs a different call at the call site,
  say so and let Codex apply it.
- Add a `VITE_` prefix to a secret. `VITE_` values are inlined into the public
  bundle. Server-only values are read from `process.env` inside `api/`.

### Codex — frontend

**Owns**

- `src/frontend/pages/` — the nine pages
- `src/frontend/layouts/` — `AppLayout`, `ProtectedRoute`
- `src/frontend/components/` — components that read app state, navigate, or call services
- `src/frontend/content/` — page copy that is data (`faq.js`)
- `src/app/` — `App.jsx` (route table), `main.jsx`, `providers.jsx`

**Must not**

- Write a Supabase query. Ask Claude for a service function.
- Edit any `.css` file, or a file under `src/design/`.
- Change a class name in JSX without agreeing it with Antigravity — the class
  name is the contract between the markup and the stylesheet.

### Antigravity — design

**Owns**

- `src/design/tokens/` — `tokens.css` (every custom property) and `palette.js` (the colour maths)
- `src/design/styles/` — `index.css`, `base.css`, `print.css`, and the 23 files in `parts/`
- `src/design/theme/` — `ThemeContext`, the theme hooks, `ThemeColorSwatches`, `AppearanceSettings`
- `src/design/primitives/` — `Icon`, `Reveal`, `Stagger`, `GridField`, `AmbientScene`, and the rest of the visual chrome
- `src/design/assets/`
- The pre-paint palette script in `index.html`, and the font `<link>` tags

**Must not**

- Change what a page fetches, computes or submits.
- Edit anything under `src/backend/` or `api/`.
- Reorder the `@import` list in `design/styles/app.css`. Import order is cascade
  order, and `23-responsive.css` must stay last.

**May**, without asking: edit `className` and inline `style` attributes inside
`frontend/` files. That is the one deliberate exception, because a visual change
often has nowhere else to land. Change nothing else in those files.

---

## 3. Shared files

| File | Who | Rule |
|---|---|---|
| `package.json` | all three | Add dependencies with `npm install <pkg>`. Never hand-edit, never reorder, never touch the lockfile by hand. |
| `src/app/App.jsx` | Codex owns | A new route is one `lazy()` line and one `<Route>` line. Claude proposes the lines; Codex applies them. |
| `src/app/providers.jsx` | Codex owns | Provider order is load-bearing — `ThemeProvider` sits outside `AuthProvider` so a signed-out visitor still gets their theme. |
| `src/shared/constants/*` | all three | Additive only. |
| `src/shared/contracts/*` | all three | Additive only. See § 6. |
| `index.html` | Antigravity + Codex | Antigravity: the palette script and font links. Codex: title and meta. |
| `vite.config.js` | Claude owns | The alias map is frozen. A new alias is a cross-agent request. |
| `jsconfig.json` | Claude owns | Must mirror the aliases in `vite.config.js` exactly. |
| `.env.example` | Claude owns | Documents both client (`VITE_`) and server variables. |
| `vercel.json` | Claude owns | The `/((?!api/).*)` rewrite must not be broadened — widening it shadows `/api/report`. |
| `scripts/check-boundaries.mjs` | Claude owns | Changing what it permits requires all three to agree. |
| `AGENT_RULES.md` | all three | Append to § 8. Do not rewrite another agent's section. |

---

## 4. Files that cannot realistically be separated

Being honest about the limits of any folder structure.

**`index.html`'s pre-paint script** duplicates `design/tokens/palette.js` on
purpose — it applies the saved palette before React boots, which is the only way
to avoid a flash of default colour, and it cannot import a module. If you change
the colour maths in `palette.js`, change it here too. The storage keys it reads
are listed in `shared/constants/storage.js`.

**CSS class names** are a contract with no file to lock. Renaming one needs
Antigravity (the stylesheet) and Codex (the markup) to move together.

**`design/theme/ThemeContext.jsx`** is theme state welded to React context
plumbing. Assigned to Antigravity because its entire purpose is visual. Codex
consumes `useTheme()` and does not edit the file.

**`design/primitives/Icon.jsx`** is SVG artwork inside a React component API.
Antigravity owns the paths; Codex adds usages.

**`frontend/pages/Settings.jsx`** was the worst file in the repo — password
changes, data export, data deletion, theme, density, motion and consent in one
component. It is now a shell that composes `@backend/services/account` and
`@design/theme/AppearanceSettings`. Keep it that way: a new setting belongs in
whichever layer owns it, not inlined back into the page.

---

## 5. Crossing into another agent's area

If a task requires touching something you do not own:

1. **Say so first.** Name the file and the boundary you are crossing.
2. **Explain why** the change is necessary, in one or two sentences.
3. **Change nothing else** in that file. No reformatting, no drive-by fixes, no
   import reordering.
4. **Prefer building in your own area.** Add an interface on your side rather
   than reaching into an implementation on theirs:
   - Need data? Ask for a service function; do not write a query in a page.
   - Need a colour? Read a token; do not hard-code a hex.
   - Need page state in a primitive? Take it as a prop; do not import a context.
   - Need a different shape from a service? Ask for it; do not reshape it in the page.
5. **Write it down** in § 8 below, so the owning agent finds it.

Refusing to cross is usually wrong. Crossing silently always is.

---

## 6. Dependencies, types and communication

**Dependencies.** Install with `npm install`, never by editing `package.json` by
hand — concurrent hand-edits are how a lockfile gets corrupted. Client-side
packages must earn their place in the bundle; a package used only by `api/` is
still a normal dependency, because Vercel installs from the same manifest.

**Shared shapes.** There is no TypeScript here, so `shared/contracts/index.js`
holds JSDoc `@typedef`s: documentation with a machine-readable shape that
editors and agents resolve, and that a reviewer can read. Nothing enforces them,
so the rule is social — **adding a field is free; renaming or removing one is a
cross-agent change**, because another agent's code is reading it.

**Communication.** Append to § 8. One line per cross-boundary change: date, the
agent, the file, and why.

---

## 7. Before you hand over

```bash
node scripts/check-boundaries.mjs   # layers, database access, cycles
npm run lint                        # 12 pre-existing warnings, no errors
npm run build                       # must succeed
```

Run the app on seeded data — no Supabase project or credentials needed:

```bash
VITE_USE_FIXTURES=true VITE_FIXTURE_SCENARIO=heavy npm run dev
```

Scenarios are `empty` (day one, every list empty — the hardest case for layout),
`week`, and `heavy` (200+ records, long strings). Do not commit or push unless
the human asks.

---

## 8. Cross-agent change log

Newest first. One line each: date · agent · file · why.

- 2026-09-09 · Claude (backend) · `src/shared/constants/tables.js` · additive: four
  table names for the roles/classes schema (`classes`, `class_teachers`,
  `class_members`, `role_change_audit`). Nothing renamed or removed.
- 2026-09-09 · Claude (backend) · `src/shared/contracts/index.js` · additive:
  `Profile`, `ClassRoom` and `StudentOverview` typedefs, so the shapes the new
  services return are documented where the frontend agent will look for them.
- 2026-09-09 · Claude (backend) · **for Codex, no frontend files touched** ·
  `useAuth()` gained `profile`, `role`, `isStudent`, `isTeacher`, `isAdmin`,
  `refreshProfile`, `authError`, `clearAuthError`, `requestPasswordReset`,
  `oauthProviders`, `signInWithOAuth`, `signInWithGoogle`, `signInWithApple`.
  Every existing field and function is unchanged, so no page needs editing to
  keep working. Three things need a page before they are reachable by a user:
  the Google/Apple buttons (render one per `oauthProviders` entry), a place to
  show `authError` on the sign-in page, and a call to
  `deleteAccount()` from `@backend/services/account` next to the existing
  "Delete data" control in Settings. Teacher and admin screens have services
  ready in `@backend/services/classes` and `@backend/services/profile` and no UI
  at all — see the handover notes rather than guessing at shapes.
- 2026-09-08 · setup · repository reorganised into `app/frontend/design/backend/shared/config`; 28 database calls moved out of pages into `backend/services/*`; `App.css` split into 23 part files; a pre-existing `utm.js ↔ consent.js` import cycle broken by extracting `backend/utils/consentStore.js`.

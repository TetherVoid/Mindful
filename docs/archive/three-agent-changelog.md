# Change log from the three-agent period (archived)

Moved out of `AGENT_RULES.md` on 2026-09-28, unchanged. Unmaintained; kept
because several entries record *why* a value is what it is.

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

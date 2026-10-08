# Session notes

Current state of the project, for whoever picks it up next. Architecture and
rules live in `AGENT_RULES.md`; the access model lives in `supabase/SECURITY.md`.
This file is the working context those two don't hold. Last rewritten
2026-09-25 — the previous version described a `src/lib/`, `src/context/`,
`App.css` layout that was replaced on 2026-09-08.

**Repo:** `git@github.com:TetherVoid/Website-.git`
**Live:** https://website-1wf9.vercel.app
**Production database:** Supabase project `czvejcytunugftbspxmr`, Mumbai. The
Seoul project `ydbhuynqjymfkqllijzc` is deprecated — do not link or migrate it.
**Stack:** Vite + React 19, plain JS and CSS, Supabase, Vercel functions in `api/`.

Mindful is a student wellbeing journal: mood (1–5 plus a note), habits, and CBT
thought records, read back on "The reading" page. Many users are school students
under 18. One agent (Claude Code) maintains the whole repository.

---

## Running it

```bash
VITE_USE_FIXTURES=true VITE_FIXTURE_SCENARIO=heavy npm run dev   # empty | week | heavy
npm run verify                                                   # every check, one summary line
```

Lint baseline: **11 warnings, 0 errors** (a ratchet — `npm run verify` lowers `scripts/lint-baseline.json` and fails if warnings rise). A clean build takes under a second; a
slow "build" is `npm install` or a Vercel deploy, not Vite.

Database, local only:

```bash
colima start
supabase start -x studio,realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit
supabase db reset --local      # replays every migration from empty
supabase test db --local       # pgTAP, supabase/tests/
```

Migrations are applied to production by the human. Nothing in a session touches
the remote database.

---

## Traps that have already cost time

- **Hidden browser tabs freeze animations.** Every page fades in through
  `motion` (`design/primitives/Reveal.jsx`, `Stagger.jsx`), which runs on
  `requestAnimationFrame`. In a hidden or backgrounded tab the browser gives it
  zero frames, so content stays at `opacity: 0` and looks like a bug. It is not
  one. Before reporting "content is invisible", check that
  `requestAnimationFrame` is actually firing in that tab. With
  `localStorage.reduceMotion = 'true'` every reveal renders as a plain element,
  which is a quick way to rule animation out.
- **Ad blockers break `npm run dev`.** uBlock-style filters block
  `src/frontend/components/CookieBanner.jsx` by filename, the import chain
  fails, and the app mounts nothing, with no console error. Use a built preview
  (`vite build --mode development` + `vite preview`) or a browser profile
  without the extension.
- **Fixtures need a non-production mode.** `VITE_USE_FIXTURES` is ignored when
  `MODE === 'production'`. For a fixtures bundle with production React, build
  with `--mode staging`.
- **`vite build --outDir` outside the project does not empty the folder**, so
  old hashed chunks pile up there.
- **Plain `npm run dev` talks to production.** `.env.local` holds the Mumbai
  URL and anon key, so a dev server without `VITE_USE_FIXTURES=true` signs in
  and reads against the live database. Preview with fixtures.

---

## Known state

- **`ANTHROPIC_API_KEY` is set in Vercel** (production only, as a secret, since
  2026-09-26). Without it `/api/report` returns 503 and the page falls back to
  the locally written reading, which uses the same figures and is intentionally
  a first-class result, not an error page. Cost controls: Claude Sonnet 5 at low
  effort, `max_tokens` 4000, and `claim_report_slot()` (3 per student, 300 per
  deployment, per 24 hours; fails closed; since `20260927000200` only for a
  confirmed account at least a day old). Token counts are logged as
  `[report] … input_tokens=… output_tokens=…` — read them in the first week to
  replace the cost estimates (~$0.025 typical, ~$0.06 worst case per reading).
- **Production database state (checked 2026-10-09 from git and the earlier
  session's record, not against the database):** `20260927000100` and
  `20260927000200` are pushed to git and their code is deployed, but there is
  no record of them being applied to the database, and no `pre-20260927` backup
  exists in `~/mindful-backups`. Treat them as **not applied** until the
  owner's migration list says otherwise. The 2026-09-26/27 entry below calling
  them "built and tested locally" was written before the git push.
- **`20261009000100` (local, not applied):**
  - Class powers need an active teacher: a demoted or suspended owner or co-teacher loses roster, code, archive, removal, co-teachers and delete.
  - A suspended student is visible to nobody, and a suspended caller to no one, self included.
  - A suspended profile is read-only.
  - Test `100`, 45 assertions.
  - Applying it pushes the two `20260927` files too; run `supabase/preflight/20261009_before_push.sql` first.
- **The privacy page is a promise about the database** (`/privacy`,
  `src/frontend/content/privacy.js`): every statement lists the files it was
  checked against, and `tests/privacy-copy.test.mjs` keeps those files real. An
  access change updates that file, `faq.js` and `supabase/SECURITY.md` in the
  same commit. `DATA_REQUEST_CONTACT` is empty (section hidden) until the owner
  fills it in.
- **Backups:** `scripts/backup-production.sh <label>` (human-run) writes to
  `~/mindful-backups`, refuses the repo, `/` and `$HOME`, and prunes folders
  whose name is 29+ days old. The privacy page promises "up to 30 days after you
  delete", so the hourly `--prune-only` cron in `MIGRATIONS.md` has to be
  installed, and dashboard backup/PITR retention must be 30 days or less.
  `/api/report` no longer takes `subjectUserId`: a reading is about the caller.
- **Consent governs all figure access** (`20260925000100`): teachers and
  administrators both need the student's `share_with_teachers`. Teacher reads
  carry no habit names and no times of day anywhere (`20260926000100` made the
  overview dates `date`).
- **Nothing a student typed goes to the AI.** Habit names and emotion words go as
  "Habit N" / "Emotion N"; the browser restores the names in the reading.
  `api/_lib/figures.js` refuses any other text. A new text field in
  `insights.js` must be added to that allowlist, or readings fall back to the
  browser.
- **Comparisons are gated** (`insights.js` top): 14 days a side, a gap of at
  least 2 standard errors of the student's own spread and 0.3 points; 6 days
  per weekday and 2.5 SE for brightest/heaviest. The heavy fixture shows no
  weekday or habit comparison under these rules — that is correct.
- **Local API testing:** `api/report.js` can be driven end to end with the
  local Supabase stack and a stub for Anthropic via `ANTHROPIC_BASE_URL`, so no
  key and no remote call are needed.
- **Support line:** `src/shared/constants/support.js` holds Tele-MANAS 14416,
  Child Helpline 1098 and Emergency 112, each with its official source. It is
  shown on every page and never conditionally. **Re-verify every number at least
  once a year** — next check due **2027-09**. KIRAN (1800-599-0019) was merged
  into Tele-MANAS in 2024 and must not be re-added.
- **Share image:** `node scripts/render-og-image.mjs` renders
  `src/design/assets/sources/og-image.svg` to `public/og-image.png` in the
  sweep's headless browser, in Newsreader and JetBrains Mono (from Google
  Fonts) with the accent word in italic. Icons are still `sips` renders.
- **Visual sweep:** `npm run sweep` (scripts/sweep/) measures every route,
  scenario, theme and seven widths; `scripts/sweep/shoot.mjs` takes targeted
  before/after screenshots. Fixture scenarios `teacher` and `admin` exist only
  so /classes and /admin can be laid out with long names — they answer the
  class and directory functions with no filtering, so they say nothing about
  access.

---

## Work log

**2026-09-25 — audit, plan, Phase A.** A full product audit and a phased plan
(A: quick wins; B: insight and the core loop; C: larger work). Phase A shipped:

- Ownership docs rewritten for a single agent; the layer rules and
  `check-boundaries.mjs` kept.
- D1 migration: consent-scoped reads for administrators; no `logged_at` or habit
  names in teacher reads; `class_overview` honours archiving. 26 new pgTAP tests.
- D2: record wording removed from AI requests, client and server.
- FAQ and Settings privacy copy rewritten to match the database.
- The support line, on all 13 routes.
- Route and root error boundaries; one automatic reload for a stale page chunk.
- Mood: no preset score, double-submit guard, same-day note; every mood average
  in `insights.js` is now per day, not per entry.
- Web app manifest, icons, theme-color, Open Graph and Twitter tags.

**2026-09-26 — Phase B.**

- Comparison thresholds raised and a noise floor added before any insight is
  shown outside the reading.
- Margin notes on the day sheet and the register, and a weekday panel on the
  mood page (`services/report/observations.js`). The thought-record comparison
  is kept off those pages because it is usually read backwards.
- Migration `20260926000100`: `report_requests` + `claim_report_slot()`, and
  date-only overview timestamps. 30 new pgTAP tests (157 in all).
- `/api/report`: Sonnet 5, low effort, 4000 tokens, database limit, token
  logging, and a server-side refusal of any student-typed text.
- Counts agree across pages; `/thoughts` pages 20 at a time.
- The storage notice no longer covers the support line.

**2026-09-26/27 — security review.** A full audit of the backend (Supabase,
`api/`, Vercel, secrets, dependencies), threat-modelled for an app used by
minors. Git history and the live bundle hold no secrets; `npm audit` is clean;
anonymous callers reach nothing. The Critical group, built and tested locally:

- `20260927000100`: length limits on every free-text column, daily insert quotas
  (50 moods, 25 thought records, 20 habits, 300 ticks per account), and
  server-set `created_at` so the quota cannot be dodged. 36 pgTAP tests.
- `20260927000200`: AI readings need a confirmed account at least a day old.
  8 pgTAP tests; `070` fixtures now date their accounts two days back.
- Journal fields stop at the database's limits and show a count near them; a
  429 from the quota reads as a sentence, not an error.
- `vercel.json`: functions in `bom1`; `X-Frame-Options: DENY`,
  `frame-ancestors 'none'`, nosniff, Referrer-Policy. Checked by
  `scripts/check-deploy-config.mjs`, which also has a `--live URL` mode.
- Auth email is to go through a dedicated Gmail account (a dashboard step for the
  human; stopgap; Resend documented
  in `MIGRATIONS.md` for when a domain exists).

Hardening and defence-in-depth items (env-var cleanup, class-owner fix, CSP,
Turnstile, admin stats panel, grants, private helper schema) are planned and
approved but not built yet.

**2026-09-28 — Claude Code workflow.** `.claude/` is now tracked: four agents
(explorer/haiku, planner/opus, reviewer/sonnet, gated-reviewer/opus), four
skills (task-workflow, approval-packet, deploy-order, migration-checklist) and
`settings.json` guards. `scripts/hooks/guard-migrations.mjs` blocks edits to
committed migrations and to the guard files themselves; `guard-remote.mjs`
blocks pushes and remote Supabase/Vercel commands and MCP calls. Both read Bash
through a small shell tokenizer (`scripts/hooks/lib/shell.mjs`); 106 cases in
`tests/guards.test.mjs`, several of them bypasses the gated-reviewer found.
The guard files are the human's to edit.
Hardened on 2026-10-02 after the gated-reviewer's second pass: heredoc or pipe
into a shell, `find -delete`, `xargs`, `git checkout <ref> -- .` and other
HEAD moves, git aliases, and child `claude --bare` / `--safe-mode` sessions are
refused (149 guard cases). `npm run verify` runs every check, including the new
`/api/report` stub test (`tests/`) and pgTAP when the stack is up. ECC is
disabled for this repo (`docs/ecc.md`). CLAUDE.md is self-contained;
AGENT_RULES.md slimmed, its archive now in `docs/archive/`. Commits are local
at the end of each task; pushing stays with the human.

**2026-10-02 — design pass.** A scripted sweep (`npm run sweep`: every route,
scenario, theme and seven widths) found the defects; four batches and two
follow-ups fixed them, each verified, re-swept and reviewed. Against the first
sweep: overflow 12 → 0, overlaps 6 → 0, text contrast failures 8 → 0, field
borders under 3:1 14 → 0, undocumented literals outside the tokens 49 → 0.

- New tokens `--target` (44px) and `--offset-sm`; light `--muted` darkened to
  about 5.5:1. Touch targets are 44px in the touch block of
  `23-responsive.css`, mirrored in JavaScript by `useTouchLayout.js`.
- The dock is sticky inside `.page-body`, which ends before the colophon, so it
  never covers the support line (checked at every width). On phones the ✉
  button is hidden; "Get in touch" lives in the colophon.
- On touch the habit calendar's cells are display-only, with the same
  information under "Read the calendar as a list".
- Reduced motion now reaches `<html>` (smooth scrolling stopped). The share
  image's accent word is italic (`scripts/render-og-image.mjs`).
- The support line's lines are 44px tall on touch, so each number has a full
  44×44 tap area. No copy changed anywhere.
- Left as decided: 24px chart handles, one heading widow, the desktop ✉ over
  content mid-scroll. Undecided: C3 (hatched disabled buttons), C4 (n/5 scores
  hidden on phones), C6 (empty states as margin notes), the custom-ink swatch;
  previews in `sweep-out/c-previews/` (gitignored, local only). C5 rejected:
  a red mark for an unlogged entry conflicts with the no-guilt principle.
- Inline text links under 44px are left as WCAG allows; the 404 page's "Read
  the marginalia" is queued as a follow-up.

Pushed and smoke-tested on production signed out: every route loads, protected
routes go to `/login`, the support line is on every page, the live headers pass.

Still to do: Phase C (calendar reminder, removing Three.js, Settings.jsx
formatting).

**2026-10-07/09 — competitor-gap work, Stage 3.** Streaks removed everywhere
(`tests/no-streaks.test.mjs`). `/privacy` added and three wrong FAQ answers
fixed. `subjectUserId` removed from `/api/report`. A backup script with 30-day
retention. Next: a migration so a demoted or suspended class owner loses class
access (H2/F5), deactivated students are invisible to teachers and admins, and
suspended users cannot edit their profile (H6). After that come the classroom
lane and items 7, 6, 5, 4, 3 and 2.

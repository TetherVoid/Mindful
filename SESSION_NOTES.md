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
node scripts/check-boundaries.mjs && npm run lint && npm run build
```

Lint baseline: **12 warnings, 0 errors.** A clean build takes under a second; a
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

---

## Known state

- **`ANTHROPIC_API_KEY` is not set in Vercel.** `/api/report` returns 503 and
  the page falls back to the locally written reading, which uses the same
  figures and is intentionally a first-class result, not an error page. Phase B
  of the current plan adds cost controls (a cheaper model and a persistent
  per-student limit) **before** the key is set.
- **Consent governs all figure access** (migration `20260925000100`): teachers
  and administrators both need the student's `share_with_teachers`. Teacher
  reads return no habit names and no time of day in the mood series.
- **Record wording is never sent to the AI** (turned off for everyone on
  2026-09-25). Only figures go, and figures include habit names and emotion
  labels.
- **Support line:** `src/shared/constants/support.js` holds Tele-MANAS 14416,
  Child Helpline 1098 and Emergency 112, each with its official source. It is
  shown on every page and never conditionally. **Re-verify every number at least
  once a year** — next check due **2027-09**. KIRAN (1800-599-0019) was merged
  into Tele-MANAS in 2024 and must not be re-added.
- **Share image and icons** are rendered from
  `src/design/assets/sources/*.svg` with macOS `sips`, which cannot draw italic
  and has no Newsreader, so the OG image uses Georgia and an upright accent
  word. Regenerate from the sources if either becomes available.

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

Still to do: Phase B (comparison threshold, insights on the day sheet, AI cost
controls, consistent counts) and Phase C (calendar reminder, removing Three.js,
mobile tap targets, light-theme contrast, Settings.jsx formatting).

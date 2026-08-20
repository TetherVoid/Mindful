# Session Notes

**Repo:** `git@github.com:TetherVoid/Website-.git`
**Live:** https://website-1wf9.vercel.app
**Stack:** Vite + React 19, react-router-dom, Supabase (Postgres + Auth + RLS), recharts

---

## What we built

Started as a 3D interactive portfolio (React Three Fiber), then pivoted entirely into **Mindful** — a personal psychology/self-tracking app with account-based cloud sync. Three core tools plus a dashboard:

- **Mood tracker** — 1–5 scale + optional note, trend line chart (recharts)
- **Habit tracker** — add habits, daily check-off, streak counting
- **CBT thought records** — situation / automatic thought / evidence for & against / balanced thought, with copy-to-text and delete
- **Dashboard** — overview tiles pulling from all three
- **FAQ** — expandable accordion, publicly viewable

Plus a full UX polish layer requested on top: dark mode toggle, sticky header, mobile menu, skip-to-content link, scroll progress bar, scroll-to-top button, cookie banner, floating contact button, loading skeletons, hover/focus states everywhere, print stylesheet, build-timestamped "last updated" footer, password visibility toggle, inline form-success states, confirmation modals before destructive actions, site search (thought records + FAQ), and UTM capture tied to a `profiles` table.

Deployed to Vercel, connected to a Supabase project for auth + data. Confirmed working end-to-end in production today.

---

## What was fixed today

Ran a full background code review (max effort, whole codebase) and fixed everything it found, plus two more caught during manual passes:

- **Signup was silently broken** — the `profiles` insert ran client-side before a session existed (default "confirm email" setting), so RLS rejected it every time with no error surfaced. Fixed with a `SECURITY DEFINER` trigger on `auth.users` that creates the row server-side; UTM values now ride along as signup metadata instead.
- **Habit dates used UTC instead of local time** — could mark the wrong day / miscount streaks for anyone west of UTC in the evening. Fixed with a `toLocalISODate` helper used everywhere a date is computed.
- **Mood chart was fetching the 30 oldest entries, not the 30 newest** — would get permanently stuck once a user passed 30 logs. Found this myself while fixing something else nearby.
- **Every Supabase write discarded its error** — a failed insert/update/delete on Mood, Habits, or Thought Records still showed a success message and cleared the form. Errors are now surfaced via an inline banner.
- **Habit checkbox had no in-flight guard** — a fast double-click could double-insert past the `unique(habit_id, date)` constraint. Also switched Habits/ThoughtRecords/Mood away from full-list reloads on every mutation to local state updates (cheaper, avoids unbounded growth cost).
- **Search overlay broke on punctuation** — a comma or parenthesis in the query malformed the PostgREST filter; also fixed a race where a slow, stale search response could overwrite a newer one.
- **Dark mode flashed light→dark on every load** — now set via a blocking inline script in `index.html` before first paint, instead of a post-mount React effect.
- **Delete confirmation modal auto-focused the destructive button** — a reflexive Enter/Space right after opening could fire an unrecoverable delete. Now focuses Cancel by default.
- **Sign-out had no error handling** (unhandled promise rejection on failure) — wrapped in try/catch.
- **Print stylesheet selector typo** — `.thought-form form` never matched anything (the class is on the form itself), so the input form printed along with the content.
- **`/login`/`/signup` didn't redirect already-authenticated users** away; **`/faq` was locked behind auth** despite being static, unauthenticated-friendly content. Both fixed.
- **Cookie banner's "Decline" didn't actually do anything** — now wired to a shared `consent.js` helper that gates/clears UTM capture.
- **`schema.sql` made idempotent** — every `CREATE POLICY` is now preceded by `DROP POLICY IF EXISTS`, so the whole file can be safely re-run (it wasn't, and the user had already run the old version once).
- **Production deploy bug**: Supabase returned "Invalid path specified in request URL" on signup. Audited every single Supabase auth call in the codebase (`signUp`, `signInWithPassword`, `signOut`, `getSession`, `onAuthStateChange`, `createClient`) — none pass a custom `redirectTo`/path, confirming the bug wasn't in app code. Root cause was the `VITE_SUPABASE_URL` value set in Vercel's environment variables. User fixed it on their end and confirmed signup works.

All fixes verified with `npm run build` + `npm run lint` — both clean.

---

## Current architecture

```
src/
  main.jsx                    — entry point, wraps app in BrowserRouter/ThemeProvider/AuthProvider
  App.jsx                     — route table (RootRedirect, PublicOnly, FaqRoute, ProtectedRoute)
  index.css / App.css         — theme tokens (light/dark via [data-theme]), all component styles
  styles/print.css            — @media print rules

  lib/
    supabaseClient.js         — createClient() from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
    utm.js                    — captures/stores/clears UTM params (gated by consent)
    consent.js                — shared cookie-consent read/write helper

  context/
    AuthContext.jsx           — session state, signUp/signIn/signOut
    ThemeContext.jsx          — light/dark, persisted to localStorage

  components/
    ProtectedRoute.jsx, AppLayout.jsx  — auth guard + shell (nav, footer, floating UI) for logged-in pages
    NavBar.jsx, Footer.jsx
    ConfirmModal.jsx, FormSuccess.jsx, PasswordInput.jsx
    CookieBanner.jsx, FloatingContactButton.jsx, SearchOverlay.jsx
    ScrollProgressBar.jsx, ScrollToTopButton.jsx, SkipToContent.jsx

  pages/
    Login.jsx, Signup.jsx, Dashboard.jsx, Mood.jsx, Habits.jsx, ThoughtRecords.jsx, FAQ.jsx

  data/faq.js                 — FAQ content (shared by FAQ page + SearchOverlay)

supabase/schema.sql            — tables, RLS policies, auth trigger (source of truth for the DB)
vercel.json                    — SPA rewrite so client-side routes don't 404 on refresh
.env.example                   — documents required env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
```

**Data model** (Postgres via Supabase, RLS on every table, owner-only access):
`profiles` (created server-side by trigger on signup, stores first-touch UTM), `mood_logs`, `habits`, `habit_logs` (unique per habit+date), `thought_records`.

**Auth flow:** Supabase email/password. `AuthContext` tracks session via `getSession()` + `onAuthStateChange`. `ProtectedRoute` guards `/dashboard`, `/mood`, `/habits`, `/thoughts`. `PublicOnly` bounces signed-in users away from `/login`/`/signup`. `/faq` works either way.

**Deployment:** GitHub → Vercel (auto-detects Vite), env vars set in Vercel dashboard. Supabase project holds the DB; Site URL + Redirect URLs configured for `localhost:5173` and the production Vercel domain.

---

## Remaining issues / known gaps

- **No code-splitting** — main JS bundle is ~818kB (recharts is the main weight). Vite warns about it; not addressed this session.
- **No automated tests** — nothing beyond manual verification + build/lint checks.
- **No CI pipeline** configured.
- **No password-reset flow** — only signup/login exist today.
- **Fixed pagination limits** (30 mood logs, 100 thought records) rather than real pagination — fine for personal use, would need revisiting at scale.
- **Email confirmation template** — user was pointed at Supabase's Email Templates settings (confirm the "Confirm signup" template uses `{{ .SiteURL }}`) but this wasn't directly verified this session.
- **Cookie/UTM consent is lightweight, not legal-grade** — good enough for a personal app, not a compliance-audited implementation.
- One review finding was deliberately **not** fixed (deprioritized by the verifier as low-severity): `AuthContext`'s `getSession()` call has no `.catch()` — only matters in a rare storage-exception edge case.

---

## Recommended next steps

1. Do one full manual pass on production: sign up with a real email → confirm → log in → add a mood entry, habit, and thought record → refresh → confirm data persisted (not just local state).
2. Check the Supabase "Confirm signup" email template uses `{{ .SiteURL }}` so confirmation links always point at the right environment.
3. Consider dynamic-importing `recharts` on the Mood page to shrink the initial bundle.
4. Decide if a password-reset flow is worth adding.
5. If the app gets real usage, add at least smoke-test coverage for auth + the three CRUD flows.
6. Keep `supabase/schema.sql` as the source of truth — if any table/policy changes are made directly in the Supabase dashboard, mirror them back into this file so it stays re-runnable.

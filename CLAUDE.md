# Mindful — Claude Code

Student wellbeing journal (mood, habits, CBT thought records). Many users are
under 18 and what they write is sensitive: privacy and consent are features.
You are the only agent and own the repo. Full rules: `AGENT_RULES.md`. Access
model: `supabase/SECURITY.md` (read the relevant part before changing who can
see what). Current state and traps: `SESSION_NOTES.md`.

Stack: Vite + React 19, plain JS and CSS, Supabase, Vercel functions in `api/`.

## Hard rules

- Commit locally at the end of a task; never push or touch the remote database
  without my "go". For those, write an approval packet and I run the commands.
- Layers: `app` → `frontend` → `design` / `backend` → `shared` / `config`.
  Only `src/backend/` imports `backend/database/client`; pages call
  `src/backend/services/*`, which return Supabase's `{ data, error }`.
- `src/config/env.js` is the only reader of `import.meta.env`. Never give a
  secret a `VITE_` prefix (it ships in the public bundle).
- Never edit a committed migration. New file + pgTAP test, local stack only.
- Never weaken RLS, consent or authorisation to make a feature easier.
- Nothing a student typed may reach the AI, logs or URLs.

## Workflow (skill: `task-workflow`)

1. Scope: ordinary, or **gated** (`supabase/`, `api/`, `vercel.json`, auth,
   consent, env).
2. Unfamiliar code → `explorer` agent. Gated or >3 files → `planner`.
3. Build the smallest diff. Migrations → `migration-checklist` skill.
4. `npm run verify` until green (one summary line; lint may only go down).
5. Review: `reviewer` (ordinary) or `gated-reviewer` (gated).
6. Commit locally. Remote steps → `approval-packet` + `deploy-order`.

Save tokens: `graphify query "<question>"` before grepping, subagents for
reading, excerpts over whole files. Run `graphify update .` after big changes.

Guards (`.claude/settings.json`, `scripts/hooks/`, `scripts/lint-baseline.json`)
block pushes, remote Supabase/Vercel calls, edits to committed migrations and
edits to the guards. They are mine: if one is wrong, tell me the fix; never
work around it. Preview with `VITE_USE_FIXTURES=true`, because plain
`npm run dev` reads `.env.local`, which points at production.

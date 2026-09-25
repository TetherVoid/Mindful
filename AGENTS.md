# Agent instructions

Mindful is maintained by one agent, Claude Code, which owns the whole
repository. **`AGENT_RULES.md` is the source of truth** — read it before you
touch anything. `CLAUDE.md` is the working summary.

If you are an agent other than Claude Code reading this file, the same rules
apply to you: the layer rules in `AGENT_RULES.md` § 1, the database rules in
§ 2, and the checks in § 5.

Stack: Vite + React 19, plain JavaScript (no TypeScript), plain CSS (no
Tailwind), Supabase, Vercel serverless functions in `api/`.

Aliases: `@app @frontend @design @backend @shared @config`.

```bash
node scripts/check-boundaries.mjs
npm run lint          # 12 pre-existing warnings, 0 errors
npm run build
VITE_USE_FIXTURES=true VITE_FIXTURE_SCENARIO=heavy npm run dev
```

Do not commit or push unless the human explicitly asks.

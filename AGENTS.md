# Agent instructions

Mindful is worked on by three AI agents in parallel. **`AGENT_RULES.md` is the
source of truth** — read it before you touch anything. This file is a summary
for the two agents that read `AGENTS.md`.

| Agent | Role | Owns |
|---|---|---|
| Claude Code | Backend | `src/backend/`, `api/`, `supabase/`, `src/config/` |
| **Codex** | **Frontend** | `src/frontend/`, `src/app/` |
| **Antigravity** | **Design** | `src/design/` |

Stack: Vite + React 19, plain JavaScript (no TypeScript), plain CSS (no
Tailwind), Supabase, one Vercel serverless function.

Aliases: `@app @frontend @design @backend @shared @config`.

---

## If you are Codex — frontend

**Own:** `src/frontend/pages`, `layouts`, `components`, `content`; `src/app/`
(route table, providers, render root).

**Do not:**
- Write a Supabase query. Ask Claude for a function in `@backend/services/*`.
  Nothing outside `backend/` may import `backend/database/client`.
- Edit any `.css` file or anything under `src/design/`.
- Rename a CSS class without agreeing it with Antigravity — the class name is
  the contract between your markup and their stylesheet.

**Pattern to follow:**

```jsx
import { listHabitsWithLogs } from '@backend/services/habits'

const { data, error } = await listHabitsWithLogs()
if (error) { setError(error.message); return }
setHabits(data.habits)
```

Services return Supabase's `{ data, error }` shape, so error handling stays
uniform across every page.

---

## If you are Antigravity — design

**Own:** `src/design/tokens/` (`tokens.css` holds every custom property;
`palette.js` holds the colour maths), `src/design/styles/` (`base.css`,
`print.css`, and 23 files in `parts/`), `src/design/theme/`,
`src/design/primitives/`, `src/design/assets/`, and in `index.html` the
pre-paint palette script and the font `<link>` tags.

**Do not:**
- Change what a page fetches, computes or submits.
- Edit anything under `src/backend/` or `api/`.
- Reorder the `@import` list in `design/styles/app.css`. Import order is cascade
  order and `23-responsive.css` must stay last.

**You may** edit `className` and inline `style` attributes inside `frontend/`
files — the one deliberate exception, because a visual change often has nowhere
else to land. Change nothing else in those files.

**Two coupled files:** `index.html`'s pre-paint script is a hand-written
duplicate of `design/tokens/palette.js`. It exists so the saved palette applies
before React boots, and it cannot import a module. Change one, change both.

---

## Both of you

Crossing into another agent's area: say so, explain why in a sentence, change
nothing else in that file, prefer adding an interface on your own side, and log
it in `AGENT_RULES.md` § 8.

Before handing over:

```bash
node scripts/check-boundaries.mjs
npm run lint          # 12 pre-existing warnings, 0 errors
npm run build
```

Run it on seeded data, no credentials needed:

```bash
VITE_USE_FIXTURES=true VITE_FIXTURE_SCENARIO=heavy npm run dev
```

Do not commit or push unless the human explicitly asks.

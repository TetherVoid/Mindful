# Antigravity — design agent

Mindful is worked on by three AI agents in parallel. **`AGENT_RULES.md` at the
repository root is the source of truth** — read it before you touch anything.
This file is a summary.

You are the **design** agent. Claude Code owns the backend, Codex owns the
frontend.

> **Note for the human:** this file is a guess at where Antigravity looks for
> project rules. The same content is in the root `AGENTS.md`, which Antigravity
> is also expected to read. Delete whichever of the two turns out to be dead.

## Stack

Vite + React 19, plain JavaScript (no TypeScript), **plain CSS — no Tailwind, no
CSS-in-JS**. Styling is custom properties plus hand-written class rules. A
paper-and-ink design system: rules not shadows, square corners not pills, serif
for language and monospace for measurement.

Aliases: `@app @frontend @design @backend @shared @config`.

## You own

```
src/design/
├── tokens/
│   ├── tokens.css     every --custom-property in the app, all 44 of them
│   └── palette.js     hue → full palette maths, contrast clamping
├── styles/
│   ├── index.css      the single stylesheet entry point
│   ├── base.css       reset, typography, focus, density, reduced motion
│   ├── print.css
│   └── parts/         01-shell.css … 23-responsive.css
├── theme/             ThemeContext, theme hooks, ThemeColorSwatches, AppearanceSettings
├── primitives/        Icon, Reveal, Stagger, GridField, AmbientScene, chrome
└── assets/
```

Plus, in `index.html`: the pre-paint palette script and the font `<link>` tags.

## You must not

- Change what a page fetches, computes or submits.
- Edit anything under `src/backend/` or `api/`.
- Import from `@frontend/*` inside `src/design/`. A primitive that needs page
  state is not a primitive — take it as a prop instead.
- Reorder the `@import` list in `styles/app.css`. Import order is cascade order,
  and `23-responsive.css` must stay last.

## You may

Edit `className` and inline `style` attributes inside `src/frontend/` files.
This is the one deliberate exception to the ownership split, because a visual
change often has nowhere else to land. Change nothing else in those files, and
tell Codex if you rename a class — the class name is the contract between their
markup and your stylesheet.

## Two things that will bite you

**The pre-paint script.** `index.html` contains a hand-written duplicate of
`tokens/palette.js`, ~130 lines of the same colour maths in ES5. It exists so a
saved accent colour applies before React boots, avoiding a flash of default
colour, and it cannot import a module. **Change the maths in one, change it in
the other.** The `localStorage` keys it reads are listed in
`@shared/constants/storage`.

**Nothing hard-codes a hex.** Every colour resolves through a token in
`tokens/tokens.css`. If you need a new colour, add a token — do not inline it.

## Before handing over

```bash
node scripts/check-boundaries.mjs   # will fail if design/ imports frontend/
npm run lint                        # 12 pre-existing warnings, 0 errors
npm run build                       # CSS output should stay ~40 kB
```

See it on seeded data, no credentials needed:

```bash
VITE_USE_FIXTURES=true VITE_FIXTURE_SCENARIO=heavy npm run dev
```

Scenarios: `empty` (day one, every list empty — the hardest case for layout),
`week`, `heavy` (200+ records, long strings, multi-line notes).

Log any cross-boundary change in `AGENT_RULES.md` § 8. Do not commit or push
unless the human explicitly asks.

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## The reading (`/report`)

The reading page turns the mood, habit and thought-record tables into a written
report. It has two layers:

- **The figures** — `src/lib/insights.js` derives every number in the browser.
  Nothing here touches the network, so the page always has something to show.
- **The words** — `POST /api/report` sends only those derived figures to Claude
  (`claude-opus-5`) and gets the prose back as structured JSON. If the endpoint
  is unavailable, `src/lib/narrative.js` writes the same report locally from the
  same figures, and the page says which one you are looking at.

The wording of thought records is **not** sent unless you tick the box on the
page. The disclosure that shows what will be sent and the request itself both
call `buildReportPayload()`, so they cannot disagree.

To enable the Claude-written version, set `ANTHROPIC_API_KEY` as a **server-side**
environment variable on the deployment — never with a `VITE_` prefix, which
would inline it into the public client bundle. `/api/report` verifies the
caller's Supabase session before spending any tokens, and rate-limits per user.
Without the key it answers 503 and the app falls back to the local report.

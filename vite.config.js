import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Path aliases mirror the agent ownership boundaries in AGENT_RULES.md.
//
// They exist for a specific reason beyond tidiness: an import line makes the
// boundary crossing visible. `@backend/...` inside a frontend/ file is a
// one-glance signal that a change reached across an ownership line, which a
// relative path like '../../lib/thing' hides completely.
//
// This map is frozen. Adding an alias is a cross-agent change — see
// AGENT_RULES.md § Shared files. Keep it in sync with jsconfig.json, which is
// what editors and coding agents read.
const alias = {
  '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
  '@frontend': fileURLToPath(new URL('./src/frontend', import.meta.url)),
  '@design': fileURLToPath(new URL('./src/design', import.meta.url)),
  '@backend': fileURLToPath(new URL('./src/backend', import.meta.url)),
  '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
  '@config': fileURLToPath(new URL('./src/config', import.meta.url)),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
})

#!/usr/bin/env node
// Checks the deployment settings in vercel.json that security depends on, and
// optionally the headers a live deployment actually sends.
//
//   node scripts/check-deploy-config.mjs            # vercel.json only
//   node scripts/check-deploy-config.mjs --live URL # and the deployed site
//
// What it holds to:
//   * functions run in bom1 (Mumbai), next to the database, so a student's
//     token and figures do not cross to the US and back;
//   * every page refuses to be framed (X-Frame-Options and CSP frame-ancestors),
//     so another site cannot overlay the Settings page's delete buttons;
//   * nosniff and a Referrer-Policy on every page;
//   * the SPA rewrite still leaves /api/* alone.
//
// Exits non-zero on the first run of failures, listing all of them.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
const failures = []
const check = (ok, message) => { if (!ok) failures.push(message) }

const REQUIRED_HEADERS = {
  'x-frame-options': (v) => v === 'DENY',
  'content-security-policy': (v) => /frame-ancestors 'none'/.test(v),
  'x-content-type-options': (v) => v === 'nosniff',
  'referrer-policy': (v) => v === 'strict-origin-when-cross-origin',
}

check(
  Array.isArray(config.regions) && config.regions.length === 1 && config.regions[0] === 'bom1',
  'vercel.json: "regions" must be ["bom1"]'
)

const everyPage = (config.headers ?? []).find((h) => h.source === '/(.*)')
check(Boolean(everyPage), 'vercel.json: no header block for "/(.*)"')
const declared = Object.fromEntries((everyPage?.headers ?? []).map((h) => [h.key.toLowerCase(), h.value]))
for (const [name, valid] of Object.entries(REQUIRED_HEADERS)) {
  check(name in declared && valid(declared[name]), `vercel.json: "${name}" missing or wrong on "/(.*)"`)
}

const rewrite = (config.rewrites ?? []).find((r) => r.destination === '/index.html')
check(rewrite?.source === '/((?!api/).*)', 'vercel.json: the SPA rewrite must stay "/((?!api/).*)" so /api/* is not shadowed')

const liveIndex = process.argv.indexOf('--live')
if (liveIndex !== -1) {
  const base = process.argv[liveIndex + 1]
  if (!base) {
    failures.push('--live needs a URL')
  } else {
    for (const path of ['/', '/settings']) {
      const response = await fetch(new URL(path, base), { redirect: 'manual' })
      for (const [name, valid] of Object.entries(REQUIRED_HEADERS)) {
        const value = response.headers.get(name)
        check(value !== null && valid(value), `live ${path}: "${name}" is ${value === null ? 'absent' : `"${value}"`}`)
      }
    }
    // x-vercel-id is "<edge>::<function region>::<id>" for a function response.
    const api = await fetch(new URL('/api/report', base))
    const hops = (api.headers.get('x-vercel-id') ?? '').split('::')
    check(hops.length >= 3 && hops[1] === 'bom1', `live /api/report ran in "${hops[1] ?? 'unknown'}", not bom1`)
  }
}

if (failures.length) {
  console.error(`✗ deploy config — ${failures.length} problem(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ deploy config — bom1, frame protection, nosniff, referrer policy${liveIndex !== -1 ? ' (vercel.json and live)' : ''}`)

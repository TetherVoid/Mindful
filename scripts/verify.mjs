#!/usr/bin/env node
// npm run verify — every check that decides whether a change is finished.
//
// Quiet by design: a passing step prints nothing, a failing step prints its own
// output, and the run ends with one summary line. That keeps a green run cheap
// to read (for a person or an agent) and a red one specific.
//
// Steps, in order:
//   boundaries   scripts/check-boundaries.mjs — layers, db access, cycles
//   deploy       scripts/check-deploy-config.mjs — bom1, frame protection, headers
//   lint         oxlint, as a ratchet: 0 errors, and warnings may not rise above
//                scripts/lint-baseline.json. When they fall, the baseline is
//                lowered to match, so a fixed warning cannot quietly come back.
//   build        vite build
//   tests        tests/*.test.mjs — /api/report against a local stub, and the
//                PreToolUse guards in scripts/hooks/
//   db           supabase test db --local, only when the local stack is up
//                (127.0.0.1:54322). Skipped, and said so, otherwise. Never remote.

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const baselineFile = fileURLToPath(new URL('./lint-baseline.json', import.meta.url))

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(), stdout: r.stdout ?? '' }
}

function dbIsUp() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: 54322 })
    socket.setTimeout(500)
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('timeout', () => (socket.destroy(), resolve(false)))
    socket.once('error', () => resolve(false))
  })
}

function lintRatchet() {
  const r = run('npx', ['oxlint', '--format=json'])
  let diagnostics
  try {
    diagnostics = JSON.parse(r.stdout).diagnostics
  } catch {
    return { ok: false, out: r.out, note: 'oxlint output unreadable' }
  }
  const errors = diagnostics.filter((d) => d.severity === 'error')
  const warnings = diagnostics.filter((d) => d.severity !== 'error')
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')).warnings
  const list = (ds) => ds.map((d) => `  ${d.filename}:${d.labels?.[0]?.span?.line ?? '?'} ${d.code} — ${d.message}`).join('\n')

  if (errors.length) return { ok: false, out: list(errors), note: `${errors.length} lint errors` }
  if (warnings.length > baseline) {
    return { ok: false, out: list(warnings), note: `lint warnings ${warnings.length} > baseline ${baseline}` }
  }
  if (warnings.length < baseline) {
    writeFileSync(baselineFile, `${JSON.stringify({ warnings: warnings.length }, null, 2)}\n`)
    return { ok: true, note: `lint baseline lowered ${baseline} → ${warnings.length}` }
  }
  return { ok: true, note: `lint ${warnings.length}/${baseline}` }
}

const steps = [
  ['boundaries', () => run('node', ['scripts/check-boundaries.mjs'])],
  ['deploy', () => run('node', ['scripts/check-deploy-config.mjs'])],
  ['lint', lintRatchet],
  ['build', () => run('npx', ['vite', 'build', '--logLevel', 'error'])],
  ['tests', () => run('node', ['--test', '--test-reporter=dot', 'tests/*.test.mjs'])],
  [
    'db',
    async () =>
      (await dbIsUp())
        ? run('supabase', ['test', 'db', '--local'])
        : { ok: true, skipped: true, note: 'db skipped (local stack down)' },
  ],
]

const passed = []
const failed = []
const notes = []

for (const [name, step] of steps) {
  const result = await step()
  if (result.note) notes.push(result.note)
  if (result.skipped) continue
  if (result.ok) {
    passed.push(name)
  } else {
    failed.push(name)
    console.log(`\n✗ ${name}${result.note ? ` — ${result.note}` : ''}\n${result.out ?? ''}`)
  }
}

const tail = notes.length ? ` · ${notes.join(' · ')}` : ''
if (failed.length) {
  console.log(`\nverify FAILED: ${failed.join(', ')} (passed: ${passed.join(', ') || 'none'})${tail}`)
  process.exit(1)
}
console.log(`verify ok: ${passed.join(', ')}${tail}`)

#!/usr/bin/env node
// Enforces the layer rules in AGENT_RULES.md § 1.
//
// The architecture needs to be checkable, not just documented — a rule nobody
// can verify is a rule that quietly stops being true. Run it before calling a
// change finished:
//
//     node scripts/check-boundaries.mjs
//
// It fails on exactly three things: an import that points the wrong way across
// a layer, a file outside backend/ reaching for the database client, and any
// import cycle.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'src')

const ALIASES = {
  '@app': 'src/app', '@frontend': 'src/frontend', '@design': 'src/design',
  '@backend': 'src/backend', '@shared': 'src/shared', '@config': 'src/config',
}

// Who may import whom. `app` is the composition root and may see everything;
// `shared` and `config` must depend on nothing, or they stop being shared.
const MAY_IMPORT = {
  app: ['frontend', 'design', 'backend', 'shared', 'config'],
  frontend: ['design', 'backend', 'shared'],
  design: ['shared'],
  backend: ['shared', 'config'],
  shared: [],
  config: [],
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.jsx?$/.test(entry) ? [full] : []
  })
}

const files = walk(SRC)
const known = new Set(files.map((f) => relative(ROOT, f)))

function resolveSpec(spec, fromFile) {
  let target
  if (spec.startsWith('@')) {
    const alias = Object.keys(ALIASES).find((a) => spec === a || spec.startsWith(a + '/'))
    if (!alias) return null
    target = spec.replace(alias, ALIASES[alias])
  } else if (spec.startsWith('.')) {
    target = relative(ROOT, resolve(dirname(fromFile), spec))
  } else {
    return null // a node_modules package
  }
  for (const ext of ['', '.js', '.jsx', '/index.js', '/index.jsx']) {
    if (known.has(target + ext)) return target + ext
  }
  return null
}

const layerOf = (p) => p.split('/')[1]
const IMPORT_RE = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g

const problems = []
const graph = new Map()

for (const file of files) {
  const rel = relative(ROOT, file)
  const text = readFileSync(file, 'utf8')
  const deps = []

  for (const [, spec] of text.matchAll(IMPORT_RE)) {
    const target = resolveSpec(spec, file)
    if (!target) continue
    deps.push(target)

    const from = layerOf(rel)
    const to = layerOf(target)
    if (from !== to && !(MAY_IMPORT[from] ?? []).includes(to)) {
      problems.push(`layer:  ${rel}\n          imports ${target}\n          ${from}/ may not import ${to}/`)
    }
    if (target.startsWith('src/backend/database/') && !rel.startsWith('src/backend/')) {
      problems.push(`db:     ${rel}\n          reaches the database client directly — go through backend/services/*`)
    }
  }
  graph.set(rel, deps)
}

// Cycles
const state = new Map()
const cycles = []
function visit(node, stack) {
  state.set(node, 'open')
  stack.push(node)
  for (const dep of graph.get(node) ?? []) {
    if (state.get(dep) === 'open') cycles.push([...stack.slice(stack.indexOf(dep)), dep])
    else if (!state.has(dep)) visit(dep, stack)
  }
  stack.pop()
  state.set(node, 'done')
}
for (const node of graph.keys()) if (!state.has(node)) visit(node, [])
for (const cycle of cycles) problems.push(`cycle:  ${cycle.join('\n          -> ')}`)

if (problems.length) {
  console.error(`\n✗ ${problems.length} boundary problem(s):\n`)
  for (const p of problems) console.error('  ' + p + '\n')
  console.error('See AGENT_RULES.md for what each layer may import.\n')
  process.exit(1)
}

console.log(`✓ boundaries clean — ${files.length} files, no layer violations, no cycles`)

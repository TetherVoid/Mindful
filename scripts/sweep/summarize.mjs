#!/usr/bin/env node
// Folds raw.jsonl from run.mjs into deduplicated findings.
//
//   node scripts/sweep/summarize.mjs [outDir]
//
// Each finding is keyed by check + route + selector (+ detail), with the
// scenarios, themes and widths it appeared at. Writes summary.json and a
// readable summary.md next to raw.jsonl.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const outDir = path.resolve(process.argv[2] ?? path.join(root, 'sweep-out'))
const rows = readFileSync(path.join(outDir, 'raw.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const tokens = existsSync(path.join(outDir, 'tokens.json')) ? JSON.parse(readFileSync(path.join(outDir, 'tokens.json'), 'utf8')) : null

const groups = new Map()
function add(check, key, where, detail) {
  const id = `${check}|${key}`
  if (!groups.has(id)) groups.set(id, { check, key, detail, routes: new Set(), builds: new Set(), themes: new Set(), widths: new Set(), count: 0 })
  const g = groups.get(id)
  g.count += 1
  for (const [k, v] of [['routes', where.route], ['builds', where.build], ['themes', where.theme], ['widths', where.width]]) if (v != null) g[k].add(v)
}

for (const r of rows) {
  const where = { route: r.final ?? r.route, build: r.build ?? r.pass, theme: r.theme, width: r.width }
  if (r.pass === 'matrix' || r.pass === 'banner' || r.pass === 'stress') {
    const tag = r.pass === 'matrix' ? '' : `${r.pass}:`
    for (const f of r.overflow ?? []) add(`${tag}overflow`, `${where.route} ${f.sel}`, where, f)
    for (const f of r.escape ?? []) add(`${tag}text-escapes`, `${where.route} ${f.sel}`, where, f)
    for (const f of r.clipped ?? []) add(`${tag}clipped`, `${where.route} ${f.sel}`, where, f)
    for (const f of r.overlap ?? []) add(`${tag}overlap`, `${where.route} ${f.a} ⟷ ${f.b}`, where, f)
    for (const f of r.fixedOverlap ?? []) add(`${tag}fixed-covers-text`, `${f.fixed} covers ${f.covers}${f.scrollY ? ' (page end)' : ' (top)'}`, where, f)
  }
  if (r.pass === 'matrix') {
    // fg === bg exactly is text at opacity 0 (collapsed or not yet shown), not a contrast pair.
    for (const f of (r.contrast ?? []).filter((c) => c.fg !== c.bg)) add('contrast', `${f.fg} on ${f.bg} (${f.ratio}:1, needs ${f.need}) ${f.sel}`, where, f)
    for (const f of r.uiContrast ?? []) add('ui-contrast', `${f.sel}`, where, f)
    if (r.width <= 768) for (const f of r.tap ?? []) add('tap-target', `${f.sel} ${f.w}×${f.h}${f.inline ? ' (inline link)' : ''}`, where, f)
    for (const f of r.widows ?? []) add('widow', `${where.route} ${f.sel} → "${f.word}"`, where, f)
    for (const f of r.align ?? []) add('alignment', `${f.kind} ${f.offset}px: ${f.a} / ${f.b}`, where, f)
  }
  if (r.pass === 'focus') {
    for (const s of r.stops ?? []) {
      const none = s.outline === 'none' && (!s.shadow || s.shadow === 'none')
      if (none) add('focus-invisible', `${s.sel} "${s.text}"`, where, s)
      else if (s.ratio != null && s.ratio < 3) add('focus-low-contrast', `${s.sel} ${s.outline} (${s.ratio}:1)`, where, s)
      if (!s.focusVisible) add('focus-not-visible-match', `${s.sel}`, where, s)
    }
  }
  if (r.pass === 'motion' && r.mode !== 'default') {
    for (const f of r.hiddenMotion ?? []) add(`motion-${r.mode}`, `${r.route} ${f.sel} ${f.anim ?? ''} ${f.opacity ? `opacity ${f.opacity}` : ''}`, where, { ...f, attr: r.attr })
  }
  if (r.pass === 'states') add('states-missing', `${r.key} "${r.text}" lacks ${r.missing.join(', ')}`, where, r)
  if (r.pass === 'dock') for (const c of r.covered) add('dock-covers-text', `${c.control} covers ${c.sel} (${r.where})`, where, c)
  if (r.pass === 'loading') add('loading-state', `${r.route} → "${r.text.slice(0, 60)}"${r.busy ? ' [aria-busy]' : ''}${r.skeleton ? ` [${r.skeleton} skeletons]` : ''}`, { route: r.route, width: r.width }, r)
}

// The same component (tag + classes) rendered differently on different pages.
const comp = new Map()
for (const r of rows.filter((x) => x.pass === 'matrix' && x.width === 1280 && x.theme === 'light')) {
  for (const c of r.components ?? []) {
    if (!comp.has(c.key)) comp.set(c.key, new Map())
    const sig = JSON.stringify(c.style)
    const m = comp.get(c.key)
    if (!m.has(sig)) m.set(sig, { style: c.style, routes: new Set() })
    m.get(sig).routes.add(`${r.build}${r.final ?? r.route}`)
  }
}
const inconsistent = []
for (const [key, sigs] of comp) {
  if (sigs.size < 2) continue
  const variants = [...sigs.values()]
  const props = Object.keys(variants[0].style).filter((p) => new Set(variants.map((v) => v.style[p])).size > 1)
  inconsistent.push({ key, props, variants: variants.map((v) => ({ routes: [...v.routes], values: Object.fromEntries(props.map((p) => [p, v.style[p]])) })) })
}
// Headings, buttons, inputs and labels: the distinct looks across the app.
const looks = {}
for (const [key, sigs] of comp) {
  const tag = key.split('.')[0]
  if (!['h1', 'h2', 'h3', 'h4', 'button', 'input', 'label', 'textarea', 'select', 'th', 'td'].includes(tag)) continue
  for (const { style, routes } of sigs.values()) {
    const look = `${style.fontFamily.split(',')[0]} ${style.fontSize} ${style.fontWeight} ${style.letterSpacing} ${style.textTransform}`
    ;((looks[tag] ??= {})[look] ??= new Set()).add(`${key} @ ${[...routes][0]}`)
  }
}

const findings = [...groups.values()]
  .map((g) => ({ ...g, routes: [...g.routes], builds: [...g.builds], themes: [...g.themes], widths: [...g.widths].sort((a, b) => a - b) }))
  .sort((a, b) => a.check.localeCompare(b.check) || b.count - a.count)
const byCheck = {}
for (const f of findings) byCheck[f.check] = (byCheck[f.check] ?? 0) + 1
const steps = rows.find((r) => r.pass === 'stress-steps')?.steps

writeFileSync(
  path.join(outDir, 'summary.json'),
  JSON.stringify({ byCheck, stressSteps: steps, findings, inconsistent, looks: Object.fromEntries(Object.entries(looks).map(([t, l]) => [t, Object.fromEntries(Object.entries(l).map(([k, v]) => [k, [...v]]))])), tokens: tokens?.summary }, null, 1)
)

const md = [`# Sweep summary`, '', `Measurements: ${rows.length}`, '', '| check | distinct findings |', '|---|---|', ...Object.entries(byCheck).map(([k, v]) => `| ${k} | ${v} |`), `| component inconsistencies | ${inconsistent.length} |`, tokens ? `| token literals | ${JSON.stringify(tokens.summary)} |` : '', '']
for (const [check] of Object.entries(byCheck)) {
  md.push(`## ${check}`, '')
  for (const f of findings.filter((x) => x.check === check).slice(0, 40)) {
    md.push(`- ${f.key} — ×${f.count}; ${f.routes.length > 4 ? `${f.routes.length} routes` : f.routes.join(' ')}; ${f.themes.join('/')}; ${f.widths.join(',')}`)
  }
  md.push('')
}
md.push('## component inconsistencies', '')
for (const c of inconsistent) md.push(`- ${c.key}: ${c.props.join(', ')} — ${c.variants.map((v) => `${JSON.stringify(v.values)} @ ${v.routes.slice(0, 3).join(' ')}`).join(' | ')}`)
writeFileSync(path.join(outDir, 'summary.md'), md.join('\n'))
console.log(JSON.stringify(byCheck))

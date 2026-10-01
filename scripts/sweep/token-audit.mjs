// Static half of the sweep: every style value that does not come from a token.
//
// Scans src/design/styles/**/*.css (tokens.css declares the tokens, so it is
// skipped) plus inline style={{…}} objects and colour attributes in JSX.
// Values tokens.css documents as deliberately literal — display sizes 1.6 /
// 1.85 / 2.0 / 2.6rem, page rhythm at 3.25rem and above, minimums inside
// clamp() — are reported with `documented: true` rather than dropped, so the
// list stays complete.
//
//   node scripts/sweep/token-audit.mjs [out.json]

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

const COLOR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|lab|lch)\(|\b(white|black|red|blue|green|gray|grey|silver)\b/i
const LENGTH = /(?<![\w-])-?\d*\.?\d+(px|rem|em|vh|vw|%)?(?![\w-])/g
const KINDS = [
  { kind: 'color', props: /^(color|background(-color)?|border(-\w+)*-color|outline-color|fill|stroke|text-decoration-color|caret-color|accent-color|column-rule-color)$/, bad: (v) => COLOR.test(v) },
  { kind: 'color', props: /^(border(-top|-right|-bottom|-left)?|outline|box-shadow|background|text-shadow)$/, bad: (v) => COLOR.test(v) },
  { kind: 'font-size', props: /^font-size$/, bad: (v) => /\d/.test(v) && !/^(1em|100%|inherit)$/.test(v) },
  { kind: 'spacing', props: /^(margin|padding|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block)(-start|-end)?)?$/, bad: (v) => [...v.matchAll(LENGTH)].some((m) => parseFloat(m[0]) !== 0 && m[1] !== '%') },
  { kind: 'radius', props: /^border(-\w+)?-radius$/, bad: (v) => !/^(0|50%|999px|9999px)$/.test(v) },
  { kind: 'border-width', props: /^(border(-top|-right|-bottom|-left)?(-width)?|outline(-width)?|outline-offset)$/, bad: (v) => /\b\d*\.?\d+px\b/.test(v) && !/^0(px)?$/.test(v) },
  { kind: 'shadow', props: /^(box-shadow|text-shadow)$/, bad: (v) => !/^(none|inherit)$/.test(v) },
]

// Remove var(...) calls (with nesting) so only literal parts are judged.
function stripVars(value) {
  let v = value
  for (let i = 0; i < 6 && v.includes('var('); i += 1) v = v.replace(/var\([^()]*\)/g, '')
  return v.trim()
}

function documented(kind, value, raw) {
  if (/clamp\(/.test(raw)) return 'clamp() bound'
  if (kind === 'font-size' && /^(1\.6|1\.85|2|2\.0|2\.6)rem$/.test(value)) return 'display one-off (tokens.css)'
  if (kind === 'spacing') {
    const nums = [...value.matchAll(/(\d*\.?\d+)rem/g)].map((m) => parseFloat(m[1]))
    if (nums.length && nums.every((n) => n >= 3.25 || n === 0)) return 'page rhythm >= 3.25rem (tokens.css)'
  }
  return null
}

const findings = []
const cssFiles = walk(path.join(root, 'src/design/styles')).filter((f) => f.endsWith('.css'))
for (const file of cssFiles) {
  const rel = path.relative(root, file)
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const lines = src.split('\n')
  let selector = ''
  lines.forEach((line, i) => {
    const sel = /^\s*([^{}]+)\{\s*$/.exec(line)
    if (sel) selector = sel[1].trim()
    for (const decl of line.matchAll(/(?:^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]+)/g)) {
      const prop = decl[1]
      if (prop.startsWith('--')) continue
      const raw = decl[2].replace(/!important/, '').trim()
      const literal = stripVars(raw)
      if (!literal) continue
      for (const k of KINDS) {
        if (!k.props.test(prop) || !k.bad(literal)) continue
        findings.push({ file: `${rel}:${i + 1}`, selector, prop, value: raw, kind: k.kind, documented: documented(k.kind, literal, raw) ?? undefined })
        break
      }
    }
  })
}

// Inline styles and colour attributes in JSX.
const jsxFiles = walk(path.join(root, 'src')).filter((f) => /\.(jsx|js)$/.test(f))
for (const file of jsxFiles) {
  const rel = path.relative(root, file)
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (/\b(fill|stroke|color|stopColor)=["']#[0-9a-f]{3,8}["']/i.test(line)) {
        findings.push({ file: `${rel}:${i + 1}`, kind: 'jsx-color', value: line.trim().slice(0, 120) })
      }
      const style = /style=\{\{([^}]*)\}\}/.exec(line)
      if (style && (COLOR.test(style[1]) || /:\s*['"]?-?\d*\.?\d+(px|rem)/.test(style[1]))) {
        findings.push({ file: `${rel}:${i + 1}`, kind: 'jsx-inline-style', value: style[1].trim().slice(0, 120) })
      }
    })
}

const summary = {}
for (const f of findings) {
  const key = `${f.kind}${f.documented ? ' (documented)' : ''}`
  summary[key] = (summary[key] ?? 0) + 1
}
const out = process.argv[2]
if (out) writeFileSync(out, JSON.stringify({ summary, findings }, null, 1))
console.log(JSON.stringify(summary))

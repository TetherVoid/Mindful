#!/usr/bin/env node
// Visual sweep: every route × fixture scenario × signed in/out × light/dark ×
// seven widths, measured in a real browser. No dependencies: a Chromium-family
// browser already on the machine is driven over the DevTools protocol with
// Node's built-in WebSocket, and the fixture builds are served from here.
//
//   node scripts/sweep/run.mjs [outDir] [--quick] [--shots]
//
// Writes outDir/raw.jsonl (every measurement), outDir/summary.json (deduped,
// counted findings) and, with --shots, PNG screenshots to outDir/shots/.
// Default outDir is sweep-out/ (gitignored). --quick: 375 and 1280 only.
//
// Browser: $SWEEP_BROWSER, else the first of Chrome, Chromium, Brave, Edge found
// in /Applications. It runs headless with a throwaway profile in outDir, so
// the user's own browser profile is never touched.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

const root = fileURLToPath(new URL('../..', import.meta.url))
const args = process.argv.slice(2)
const outDir = path.resolve(args.find((a) => !a.startsWith('--')) ?? path.join(root, 'sweep-out'))
const QUICK = args.includes('--quick')
const PASSES = (args.find((a) => a.startsWith('--passes='))?.slice(9) ?? 'matrix,banner,focus,motion,loading,stress,dock,states,shots').split(',')
const run = (name) => PASSES.includes(name)
const ONLY_BUILDS = args.find((a) => a.startsWith('--builds='))?.slice(9).split(',')
const SHOTS = args.includes('--shots')
mkdirSync(outDir, { recursive: true })
const rawFile = path.join(outDir, 'raw.jsonl')
if (!args.includes('--append')) rmSync(rawFile, { force: true })
const record = (entry) => appendFileSync(rawFile, `${JSON.stringify(entry)}\n`)
const auditSource = readFileSync(new URL('./page-audit.js', import.meta.url), 'utf8')

const WIDTHS = QUICK ? [375, 1280] : [320, 375, 414, 768, 1024, 1280, 1440]
const TOUCH_MAX = 768
const THEMES = ['light', 'dark']
const SIGNED_IN_ROUTES = ['/dashboard', '/mood', '/habits', '/thoughts', '/report', '/settings', '/classes', '/faq', '/admin', '/no-such-page']
const SIGNED_OUT_ROUTES = ['/login', '/signup', '/faq', '/auth/callback', '/no-such-page']

// --- builds ---------------------------------------------------------------
const BUILDS = {
  empty: { VITE_FIXTURE_SCENARIO: 'empty' },
  week: { VITE_FIXTURE_SCENARIO: 'week' },
  heavy: { VITE_FIXTURE_SCENARIO: 'heavy' },
  signedout: { VITE_FIXTURE_SCENARIO: 'week', VITE_FIXTURE_SIGNED_OUT: 'true' },
  slow: { VITE_FIXTURE_SCENARIO: 'week', VITE_FIXTURE_LATENCY: '4000' },
  // Layout-only role scenarios (see fixtures.js): /classes and /admin with
  // long class and student names.
  teacher: { VITE_FIXTURE_SCENARIO: 'teacher' },
  admin: { VITE_FIXTURE_SCENARIO: 'admin' },
}
for (const [name, env] of Object.entries(BUILDS)) {
  const dir = path.join(outDir, 'builds', name)
  const r = spawnSync('npx', ['vite', 'build', '--mode', 'development', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: root,
    env: { ...process.env, VITE_USE_FIXTURES: 'true', VITE_FIXTURE_LATENCY: '0', ...env },
    encoding: 'utf8',
  })
  if (r.status !== 0) throw new Error(`build ${name} failed:\n${r.stderr}`)
}

// --- static servers (SPA fallback) ------------------------------------------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' }
const servers = {}
for (const name of Object.keys(BUILDS)) {
  const dir = path.join(outDir, 'builds', name)
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = path.join(dir, url)
    if (!file.startsWith(dir) || !existsSync(file) || url.endsWith('/')) file = path.join(dir, 'index.html')
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers[name] = { server, origin: `http://127.0.0.1:${server.address().port}` }
}

// --- browser ------------------------------------------------------------------
const CANDIDATES = [
  process.env.SWEEP_BROWSER,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean)
const browserPath = CANDIDATES.find((p) => existsSync(p))
if (!browserPath) throw new Error('No Chromium-family browser found; set SWEEP_BROWSER.')
const port = 9300 + Math.floor(Math.random() * 500)
const profile = path.join(outDir, 'profile')
const browser = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', '--mute-audio',
], { stdio: 'ignore' })
const stop = () => browser.kill()
process.on('exit', stop)
process.on('uncaughtException', (error) => {
  console.error(error)
  stop()
  process.exit(1)
})
let version
for (let i = 0; i < 50 && !version; i += 1) {
  await sleep(200)
  version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => null)
}
if (!version) throw new Error('browser did not start')

const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)))
let seq = 0
const pending = new Map()
const waiters = []
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data)
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id)
    pending.delete(data.id)
    if (data.error) reject(new Error(data.error.message))
    else resolve(data.result)
  } else if (data.method) {
    for (const w of [...waiters]) {
      if (w.method !== data.method) continue
      waiters.splice(waiters.indexOf(w), 1)
      w.resolve(data.params)
    }
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
const once = (method, ms = 15000) =>
  Promise.race([new Promise((resolve) => waiters.push({ method, resolve })), sleep(ms).then(() => null)])
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
  return r.result.value
}

await send('Page.enable')
await send('Runtime.enable')

let preload = null
async function setup({ width, theme, reduceMedia = false, storage = {} }) {
  const mobile = width <= TOUCH_MAX
  await send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 800 : 900, deviceScaleFactor: 1, mobile })
  await send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false })
  await send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: theme },
      { name: 'prefers-reduced-motion', value: reduceMedia ? 'reduce' : 'no-preference' },
    ],
  })
  if (preload) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: preload })
  // reduceMotion renders every Reveal as a plain element, so content below the
  // fold is measured too (otherwise it waits at opacity 0 for a scroll). The
  // motion pass overrides this to test animation itself.
  const items = { theme, cookie_consent: 'declined', reduceMotion: 'true', ...storage }
  const source = `try{localStorage.clear();${Object.entries(items)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)},${JSON.stringify(v)});`)
    .join('')}}catch(e){}`
  preload = (await send('Page.addScriptToEvaluateOnNewDocument', { source })).identifier
}

async function load(url, settle = 1200) {
  const loaded = once('Page.loadEventFired')
  await send('Page.navigate', { url })
  await loaded
  await sleep(settle)
}

// Viewport-sized captures only: a full-page capture resizes the viewport,
// which changes every vh-based height and leaves fixed layers painted once.
async function shot(name, { end = false } = {}) {
  if (!SHOTS) return
  mkdirSync(path.join(outDir, 'shots'), { recursive: true })
  const take = async (suffix) => {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(path.join(outDir, 'shots', `${name}${suffix}.png`), Buffer.from(r.data, 'base64'))
    shotCount += 1
  }
  await evaluate('scrollTo(0, 0)')
  await take('')
  if (end) {
    await evaluate(`scrollTo(0, document.documentElement.scrollHeight); dispatchEvent(new Event('scroll'))`)
    await sleep(400)
    await take('-end')
    await evaluate('scrollTo(0, 0)')
  }
}
let shotCount = 0

const progress = (s) => process.stderr.write(`${s}\n`)

// --- pass 1: the matrix ------------------------------------------------------
const plan = [
  ...['empty', 'week', 'heavy'].map((build) => ({ build, routes: SIGNED_IN_ROUTES, auth: 'in' })),
  { build: 'signedout', routes: SIGNED_OUT_ROUTES, auth: 'out' },
  { build: 'teacher', routes: ['/classes', '/dashboard', '/settings'], auth: 'in' },
  { build: 'admin', routes: ['/admin', '/classes'], auth: 'in' },
].filter((p) => !ONLY_BUILDS || ONLY_BUILDS.includes(p.build))
for (const { build, routes, auth } of run('matrix') ? plan : []) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      await setup({ width, theme })
      for (const route of routes) {
        await load(servers[build].origin + route)
        let audit
        try {
          audit = await evaluate(auditSource)
        } catch (error) {
          audit = { error: error.message }
        }
        record({ pass: 'matrix', build, auth, theme, width, route, final: audit.url, ...audit })
      }
      progress(`matrix ${build} ${theme} ${width}`)
    }
  }
}

// --- pass 2: cookie banner on first visit (overlap) ---------------------------
for (const width of run('banner') ? [320, 375, 768, 1280] : []) {
  await setup({ width, theme: 'light', storage: { cookie_consent: null } })
  for (const route of ['/login', '/faq']) {
    await load(servers.signedout.origin + route)
    record({ pass: 'banner', build: 'signedout', theme: 'light', width, route, ...(await evaluate(auditSource)) })
  }
}

// --- pass 3: keyboard focus, by tabbing --------------------------------------
const focusProbe = `(() => {
  const el = document.activeElement
  if (!el || el === document.body) return null
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const parse = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c); if (!m) return null; const p = m[1].split(/[\\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
  const lum = ({ r, g, b }) => { const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  let bg = null
  for (let e = el.parentElement; e && !bg; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a >= 1) bg = c }
  bg = bg ?? { r: 255, g: 255, b: 255 }
  const oc = parse(s.outlineColor)
  const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0
  const ratio = outline && oc ? (Math.max(lum(oc), lum(bg)) + 0.05) / (Math.min(lum(oc), lum(bg)) + 0.05) : null
  const cls = [...el.classList].slice(0, 3).join('.')
  return { sel: el.tagName.toLowerCase() + (cls ? '.' + cls : ''), text: (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 30), focusVisible: el.matches(':focus-visible'), outline: outline ? s.outlineWidth + ' ' + s.outlineStyle + ' ' + s.outlineColor : 'none', ratio: ratio && +ratio.toFixed(2), shadow: s.boxShadow, onScreen: r.bottom > 0 && r.top < innerHeight }
})()`
for (const theme of run('focus') ? THEMES : []) {
  await setup({ width: 1280, theme })
  for (const { build, routes } of [{ build: 'week', routes: SIGNED_IN_ROUTES }, { build: 'signedout', routes: SIGNED_OUT_ROUTES }]) {
    for (const route of routes) {
      await load(servers[build].origin + route)
      const stops = []
      for (let i = 0; i < 45; i += 1) {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
        await sleep(30)
        const f = await evaluate(focusProbe)
        if (!f) continue
        if (stops.length && stops[0].sel === f.sel && stops[0].text === f.text) break
        stops.push(f)
      }
      record({ pass: 'focus', build, theme, route, stops })
    }
  }
  progress(`focus ${theme}`)
}

// --- pass 4: reduced motion, early in the load ---------------------------------
for (const mode of run('motion') ? ['default', 'media', 'setting'] : []) {
  await setup({ width: 1280, theme: 'light', reduceMedia: mode === 'media', storage: { reduceMotion: mode === 'setting' ? 'true' : null } })
  for (const route of SIGNED_IN_ROUTES) {
    await load(servers.week.origin + route, 120)
    const audit = await evaluate(auditSource)
    record({ pass: 'motion', mode, route, hiddenMotion: audit.hiddenMotion, attr: await evaluate(`document.documentElement.dataset.motion`) })
  }
}
progress('motion')

// --- pass 5: loading states (4 s latency) --------------------------------------
// The latency also delays the session, so boot once, then move in-app: each
// page's own loading state shows, not the app-wide one.
for (const width of run('loading') ? [375, 1280] : []) {
  await setup({ width, theme: 'light' })
  await load(`${servers.slow.origin}/faq`, 9000)
  await evaluate(`window.__go = (route) => { history.pushState({}, '', route); dispatchEvent(new PopStateEvent('popstate')); return true }`)
  for (const route of SIGNED_IN_ROUTES) {
    await evaluate(`__go('${route}')`)
    await sleep(400)
    const state = await evaluate(`(() => { const m = document.querySelector('main') ?? document.body; return { text: m.innerText.trim().slice(0, 160), busy: !!document.querySelector('[aria-busy=true]'), skeleton: document.querySelectorAll('[class*=skeleton],[class*=Skeleton]').length, height: Math.round(m.getBoundingClientRect().height) } })()`)
    record({ pass: 'loading', width, route, ...state })
    await shot(`loading-${width}-${route.slice(1).replace(/\W+/g, '-') || 'root'}`)
  }
}
progress('loading')

// --- pass 6: long content, entered through the UI ------------------------------
const LONG_WORD = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(2)
const stressHelpers = `
  window.__fill = (sel, value) => { const el = document.querySelector(sel); if (!el) return false
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true }
  window.__click = (text) => { const t = text.toLowerCase(); const b = [...document.querySelectorAll('button,[role=radio],a')].find((e) => e.textContent.trim().toLowerCase().replace(/\\s+/g, ' ').includes(t)); if (b) b.click(); return !!b }
  window.__submit = (sel) => { const f = document.querySelector(sel)?.form; if (f) f.requestSubmit(); return !!f }
  window.__go = (route) => { history.pushState({}, '', route); dispatchEvent(new PopStateEvent('popstate')); return true }
`
if (run('stress')) {
await setup({ width: 1280, theme: 'light' })
await load(`${servers.signedout.origin}/signup`)
await evaluate(stressHelpers)
const steps = []
const step = async (what, js, wait = 700) => {
  const ok = await evaluate(js)
  steps.push({ what, ok })
  await sleep(wait)
}
await step('email', `__fill('#email', 'a.very.long.student.email.address.that.keeps.going@pupils.some-very-long-school-district-name.example.edu')`, 50)
await step('password', `__fill('input[type=password]', 'correct horse battery staple 42')`, 50)
await step('create account', `__submit('#email')`, 1500)
await step('to settings', `__go('/settings')`, 1200)
await step('display name', `__fill('#display-name', 'Bartholomew-Alexandria ${LONG_WORD}')`, 100)
await step('save profile', `__submit('#display-name')`, 900)
await step('to habits', `__go('/habits')`, 1200)
await step('habit', `__fill('#new-habit', '${LONG_WORD}')`, 100)
await step('add habit', `__submit('#new-habit')`, 900)
await step('to thoughts', `__go('/thoughts')`, 1200)
await step('situation', `__fill('#situation', '${LONG_WORD} ${LONG_WORD}')`, 50)
await step('thought', `__fill('#automatic_thought', '${LONG_WORD}')`, 50)
await step('emotion', `__fill('#emotion', '${LONG_WORD.slice(0, 40)}')`, 50)
await step('file record', `__submit('#situation')`, 900)
await step('to mood', `__go('/mood')`, 1200)
await step('mark', `__click('good')`, 100)
await step('note', `__fill('#mood-note', '${LONG_WORD}')`, 50)
await step('log mood', `__submit('#mood-note')`, 900)
record({ pass: 'stress-steps', steps })
for (const width of [320, 375, 768, 1280]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: width <= TOUCH_MAX })
  for (const route of ['/dashboard', '/mood', '/habits', '/thoughts', '/report', '/settings', '/classes']) {
    await evaluate(`__go('${route}')`)
    await sleep(1000)
    const a = await evaluate(auditSource)
    record({ pass: 'stress', width, route, overflow: a.overflow, escape: a.escape, clipped: a.clipped, overlap: a.overlap, scrollWidth: a.scrollWidth, viewport: a.viewport })
    if (width === 320) await shot(`stress-320-${route.slice(1)}`, { end: true })
  }
}
progress('stress')
}

// --- pass 7: the dock and other fixed controls, after scrolling ------------
// The dock appears on a scroll event, which React handles a frame later, so
// this waits after each scroll before measuring what fixed controls cover.
const dockProbe = `(() => {
  const vis = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && r.width > 0 && r.height > 0 }
  const fixed = [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'fixed' && vis(e) && getComputedStyle(e).pointerEvents !== 'none' && e.querySelector('button,a'))
  const own = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
  const texts = [...document.querySelectorAll('main *, footer *, .colophon *')].filter((e) => own(e) && vis(e) && !e.closest('[class*=dock]'))
  const out = []
  for (const f of fixed) for (const b of f.querySelectorAll('button,a')) {
    if (!vis(b)) continue
    const fr = b.getBoundingClientRect()
    for (const t of texts) for (const r of t.getClientRects()) {
      const w = Math.min(fr.right, r.right) - Math.max(fr.left, r.left), h = Math.min(fr.bottom, r.bottom) - Math.max(fr.top, r.top)
      if (w > 2 && h > 2) { out.push({ control: (b.getAttribute('aria-label') || b.innerText).slice(0, 30), text: t.innerText.trim().slice(0, 40), sel: t.tagName.toLowerCase() + '.' + [...t.classList].join('.') }); break }
    }
  }
  return { out, max: document.documentElement.scrollHeight - innerHeight }
})()`
for (const theme of run('dock') ? ['light'] : []) {
  for (const width of WIDTHS) {
    await setup({ width, theme })
    for (const { build, routes } of [{ build: 'heavy', routes: SIGNED_IN_ROUTES }, { build: 'empty', routes: SIGNED_IN_ROUTES }, { build: 'signedout', routes: SIGNED_OUT_ROUTES }]) {
      for (const route of routes) {
        await load(servers[build].origin + route)
        const max = (await evaluate(dockProbe)).max
        for (const [where, y] of [['top', 0], ['end', max]]) {
          await evaluate(`scrollTo(0, ${Math.max(0, y)}); dispatchEvent(new Event('scroll'))`)
          await sleep(350)
          const { out } = await evaluate(dockProbe)
          if (out.length) record({ pass: 'dock', build, theme, width, route, where, covered: out })
        }
      }
    }
    progress(`dock ${width}`)
  }
}

// --- pass 8: interaction states, forced -----------------------------------
// Each kind of control (tag + classes) is put into :hover, :active and
// :focus-visible with CSS.forcePseudoState, and disabled by attribute; a state
// is missing when nothing visible changes. Measured, not inferred from selectors.
const STATE_PROPS = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'boxShadow', 'outlineStyle', 'outlineColor', 'transform', 'textDecorationLine', 'opacity', 'filter', 'translate']
if (run('states')) {
  await send('DOM.enable')
  await send('CSS.enable')
  for (const [width, build, routes] of [[1280, 'heavy', SIGNED_IN_ROUTES], [1280, 'signedout', SIGNED_OUT_ROUTES], [375, 'heavy', ['/dashboard', '/habits', '/settings']]]) {
    await setup({ width, theme: 'light' })
    for (const route of routes) {
      await load(servers[build].origin + route)
      const keys = await evaluate(`(() => {
        const seen = new Map()
        for (const el of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button]')) {
          const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue
          const key = el.tagName.toLowerCase() + [...el.classList].map((c) => '.' + c).join('') + (el.tagName === 'INPUT' ? '[' + el.type + ']' : '')
          if (seen.has(key)) continue
          el.setAttribute('data-sweep', String(seen.size)); seen.set(key, { key, text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30), canDisable: 'disabled' in el })
        }
        return [...seen.values()]
      })()`)
      const { root } = await send('DOM.getDocument', { depth: -1 })
      const read = (i) => evaluate(`(() => { const s = getComputedStyle(document.querySelector('[data-sweep="${i}"]')); return JSON.stringify(${JSON.stringify(STATE_PROPS)}.map((p) => s[p])) })()`)
      for (const [i, k] of keys.entries()) {
        const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-sweep="${i}"]` })
        if (!nodeId) continue
        const base = await read(i)
        const missing = []
        for (const state of ['hover', 'active', 'focus-visible']) {
          await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: state === 'focus-visible' ? ['focus', 'focus-visible'] : [state] })
          await sleep(state === 'hover' ? 200 : 20) // let transitions land
          if ((await read(i)) === base) missing.push(state)
          await send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
        }
        if (k.canDisable) {
          const changed = await evaluate(`(() => { const el = document.querySelector('[data-sweep="${i}"]'); const was = el.disabled; el.disabled = true; const s = getComputedStyle(el); const v = JSON.stringify(${JSON.stringify(STATE_PROPS)}.map((p) => s[p])); el.disabled = was; return v })()`)
          if (changed === base) missing.push('disabled')
        }
        if (missing.length) record({ pass: 'states', build, width, route, key: k.key, text: k.text, missing })
      }
    }
    progress(`states ${build} ${width}`)
  }
}

// --- pass 9: representative screenshots --------------------------------------
if (SHOTS && run('shots')) {
  for (const [theme, widths] of [['light', [375, 768, 1280]], ['dark', [1280]]]) {
    for (const width of widths) {
      await setup({ width, theme })
      for (const route of SIGNED_IN_ROUTES.filter((r) => r !== '/admin')) {
        await load(servers.heavy.origin + route)
        await shot(`${theme}-${width}-${route.slice(1).replace(/\W+/g, '-')}`, { end: width === 375 && theme === 'light' })
      }
      for (const route of ['/login', '/signup']) {
        await load(servers.signedout.origin + route)
        await shot(`${theme}-${width}-out-${route.slice(1)}`)
      }
    }
  }
}

writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({ browser: browserPath, version: version.Browser, widths: WIDTHS, shots: shotCount, when: new Date().toISOString() }, null, 1))
ws.close()
browser.kill()
for (const { server } of Object.values(servers)) server.close()
progress(`done — ${shotCount} screenshots`)

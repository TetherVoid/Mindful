// Shared plumbing for run.mjs and shoot.mjs: fixture builds, a static server
// per build, and a headless Chromium-family browser driven over the DevTools
// protocol with Node's built-in WebSocket. No dependencies.
//
// Browser: $SWEEP_BROWSER, else the first of Chrome, Chromium, Brave, Edge found
// in /Applications. It runs headless with a throwaway profile in outDir, so
// the user's own browser profile is never touched.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'

export { sleep }
// SWEEP_ROOT builds another checkout (e.g. a worktree of HEAD, for "before" shots).
export const root = process.env.SWEEP_ROOT ?? fileURLToPath(new URL('../..', import.meta.url))
export const TOUCH_MAX = 768

export const BUILDS = {
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

/** `vite build --mode development` for each named fixture build, into outDir/builds/<name>. */
export function buildAll(outDir, names = Object.keys(BUILDS)) {
  for (const name of names) {
    const dir = path.join(outDir, 'builds', name)
    const r = spawnSync('npx', ['vite', 'build', '--mode', 'development', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: root,
      env: { ...process.env, VITE_USE_FIXTURES: 'true', VITE_FIXTURE_LATENCY: '0', ...BUILDS[name] },
      encoding: 'utf8',
    })
    if (r.status !== 0) throw new Error(`build ${name} failed:\n${r.stderr}`)
  }
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' }

/** One 127.0.0.1 static server per build, with SPA fallback. Returns { name: { server, origin } }. */
export async function serveAll(outDir, names = Object.keys(BUILDS)) {
  const servers = {}
  for (const name of names) {
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
  return servers
}

/** Launch the browser and open one page. Returns the page's DevTools helpers. */
export async function openBrowser(outDir) {
  const candidates = [
    process.env.SWEEP_BROWSER,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean)
  const browserPath = candidates.find((p) => existsSync(p))
  if (!browserPath) throw new Error('No Chromium-family browser found; set SWEEP_BROWSER.')
  const port = 9300 + Math.floor(Math.random() * 500)
  const browser = spawn(browserPath, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(outDir, 'profile')}`,
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
  // Viewport, touch, colour scheme, motion, and the localStorage the app reads
  // before it boots. reduceMotion renders every Reveal as a plain element, so
  // content below the fold is measured too; pass reduceMotion: null to test
  // animation itself.
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

  // Viewport-sized only: a full-page capture resizes the viewport, which
  // changes every vh-based height and leaves fixed layers painted once.
  async function capture() {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    return Buffer.from(r.data, 'base64')
  }

  function close() {
    ws.close()
    stop()
  }
  return { send, once, evaluate, setup, load, capture, close, version: version.Browser, browserPath }
}

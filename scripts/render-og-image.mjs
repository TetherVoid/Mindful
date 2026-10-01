#!/usr/bin/env node
// Renders src/design/assets/sources/og-image.svg to public/og-image.png
// (1200×630) in the headless browser the visual sweep uses, with the app's own
// fonts. macOS `sips`, which drew the old one, has no italic and no
// Newsreader, so the accent word came out upright in Georgia.
//
//   node scripts/render-og-image.mjs
//
// Fonts load from Google Fonts, as the app's do. If they cannot be reached the
// SVG's fallbacks (Georgia, Menlo) are used and the script says so.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { openBrowser, root, sleep } from './sweep/lib.mjs'

const svg = readFileSync(path.join(root, 'src/design/assets/sources/og-image.svg'), 'utf8')
const page = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,300&family=JetBrains+Mono:wght@400&display=block" rel="stylesheet">
<style>html,body{margin:0;background:#efece2}svg{display:block}</style></head><body>${svg}</body></html>`

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(page)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

const work = path.join(root, 'sweep-out', 'og')
mkdirSync(work, { recursive: true })
const browser = await openBrowser(work)
await browser.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false })
await browser.load(`http://127.0.0.1:${server.address().port}/`, 300)
await browser.evaluate('document.fonts.ready.then(() => true)')
await sleep(300)
const loaded = await browser.evaluate(
  `['Newsreader', 'JetBrains Mono'].map((f) => f + ': ' + (document.fonts.check('italic 300 82px "' + f + '"') || document.fonts.check('82px "' + f + '"')))`
)
writeFileSync(path.join(root, 'public/og-image.png'), await browser.capture())
browser.close()
server.close()
console.log(`public/og-image.png written (${loaded.join(', ')})`)

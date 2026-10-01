#!/usr/bin/env node
// Targeted screenshots of specific spots, for before/after comparisons.
//
//   node scripts/sweep/shoot.mjs <spots.json> <outDir> [--label=before]
//
// spots.json is a list of
//   { "name": "habits-end", "build": "heavy", "route": "/habits",
//     "width": 375, "theme": "light",
//     "at": "top" | "end" | "<css selector to scroll into view>",
//     "steps": ["js to run first, e.g. a click"], "clip": true }
// `clip` crops to the selector's element (plus a margin) instead of the viewport.
// Files land in outDir/<name>-<label>.png. Builds only what the spots name.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { sleep, buildAll, serveAll, openBrowser } from './lib.mjs'

const [spotsFile, outArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const label = process.argv.find((a) => a.startsWith('--label='))?.slice(8) ?? 'shot'
const spots = JSON.parse(readFileSync(spotsFile, 'utf8'))
const outDir = path.resolve(outArg)
mkdirSync(outDir, { recursive: true })

const work = path.join(outDir, '.work')
const names = [...new Set(spots.map((s) => s.build))]
buildAll(work, names)
const servers = await serveAll(work, names)
const page = await openBrowser(work)

for (const spot of spots) {
  await page.setup({ width: spot.width, theme: spot.theme ?? 'light', storage: spot.storage ?? {} })
  await page.load(servers[spot.build].origin + spot.route)
  for (const js of spot.steps ?? []) {
    await page.evaluate(js)
    await sleep(400)
  }
  let clip
  if (spot.at === 'end') {
    await page.evaluate(`scrollTo(0, document.documentElement.scrollHeight); dispatchEvent(new Event('scroll'))`)
  } else if (spot.at && spot.at !== 'top') {
    await page.evaluate(`document.querySelector(${JSON.stringify(spot.at)})?.scrollIntoView({ block: 'center', behavior: 'instant' }); dispatchEvent(new Event('scroll'))`)
  }
  await sleep(400)
  // Measured after the scroll settles, in page coordinates (what the clip uses).
  if (spot.at && !['top', 'end'].includes(spot.at)) {
    clip = await page.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(spot.at)})
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: Math.max(0, r.left + scrollX - 24), y: Math.max(0, r.top + scrollY - 24), width: Math.min(innerWidth, r.width + 48), height: Math.min(innerHeight, r.height + 48) }
    })()`)
  }
  const shot =
    spot.clip && clip
      ? Buffer.from((await page.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })).data, 'base64')
      : await page.capture()
  writeFileSync(path.join(outDir, `${spot.name}-${label}.png`), shot)
  process.stderr.write(`${spot.name}-${label}\n`)
}

page.close()
for (const { server } of Object.values(servers)) server.close()

// Mindful counts days on the page; it does not count unbroken runs of them.
// A streak turns one missed day into a loss, which is the guilt the product
// rules out, so the word should not come back into the app, the report, the
// figures sent for a reading, or the FAQ.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

test('no streaks anywhere in src/ or api/', () => {
  const hits = ['src', 'api']
    .flatMap((dir) => files(join(root, dir)))
    .filter((path) => /\.(jsx?|mjs|css)$/.test(path))
    .flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .map((line, i) => (/streak/i.test(line) ? `${path.slice(root.length)}:${i + 1}` : null))
        .filter(Boolean)
    )
  assert.deepEqual(hits, [])
})

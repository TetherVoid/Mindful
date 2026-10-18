// The privacy page is a promise about the database. Each statement carries the
// file it was checked against, so a reviewer can re-check it and a later change
// to that file has somewhere to look. These tests keep the sources real and
// keep out the claims that were wrong before.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DATA_REQUEST_CONTACT, privacySections, shortVersion } from '../src/frontend/content/privacy.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const items = [...shortVersion, ...privacySections.flatMap((s) => s.items)]
const allText = items.map((i) => i.text).join(' ')
const faq = readFileSync(new URL('../src/frontend/content/faq.js', import.meta.url), 'utf8')

test('every statement names at least one source, and every source exists', () => {
  assert.ok(items.length > 0)
  for (const item of items) {
    assert.ok(Array.isArray(item.sources) && item.sources.length, `no source: ${item.text.slice(0, 60)}`)
    for (const source of item.sources) {
      const file = source.split(':')[0]
      assert.ok(existsSync(`${root}${file}`), `missing source file ${file}`)
    }
  }
})

test('says what administrators can see, including email addresses', () => {
  assert.match(allText, /administrator/i)
  assert.match(allText, /email address/i)
  assert.match(allText, /not recorded|isn’t recorded|is not recorded/i)
})

test('names where the data is and points to Anthropic’s own policy', () => {
  assert.match(allText, /Mumbai/)
  assert.ok(items.some((i) => i.link?.href?.startsWith('https://www.anthropic.com/')))
})

test('makes none of the claims that are untrue of a hosted database', () => {
  const untrue = /\bno data\b|collect nothing|never leaves? (this|your) device|completely private|anonymous|fully encrypted/i
  assert.doesNotMatch(allText, untrue)
  assert.doesNotMatch(faq, /never leave your device/i)
  assert.doesNotMatch(faq, /nothing about you except that you have joined/i)
})

test('the contact is either unset (section hidden) or a real address, never a placeholder', () => {
  if (DATA_REQUEST_CONTACT === '') return
  assert.match(DATA_REQUEST_CONTACT, /^[^\s@[\]]+@[^\s@[\]]+\.[^\s@[\]]+$/)
})

test('the short version is four lines, each backed by a source like the rest', () => {
  assert.equal(shortVersion.length, 4)
  for (const line of shortVersion) assert.ok(line.sources?.length, line.text)
})

test('backups are described as the operator’s, kept up to 30 days', () => {
  assert.match(allText, /backups kept by whoever runs Mindful for up to 30 days/)
  assert.doesNotMatch(allText, /database service’s backups/)
})

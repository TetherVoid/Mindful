// /api/report, end to end, against a local stub — no key, no stack, no network.
//
// One HTTP server on 127.0.0.1 plays both upstreams: Supabase (auth/v1/user and
// rest/v1/rpc/*) and Anthropic (/v1/messages, reached via ANTHROPIC_BASE_URL).
// The handler is called directly with a Vercel-shaped req/res. What this pins
// down is the order of refusals in api/report.js: every check that can say no
// for free runs before a slot is claimed, and no refused request reaches the
// model.
//
// Run: node --test 'tests/*.test.mjs'   (npm run verify runs it too)

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

const STUDENT_TEXT = 'I felt awful after the exam'
const OTHER_STUDENT = '11111111-2222-4333-8444-555555555555'

// What the stub answers, set per test. Tokens name users: "tok-<name>" is user
// "<name>", so every test gets its own id and the in-memory limiter never trips.
const stub = { slot: 'ok', slotStatus: 200, mayView: false, stopReason: 'end_turn' }
const calls = { anthropic: [], slots: 0 }

const REPORT = {
  title: 'A steady fortnight, mostly',
  summary: 'Fourteen days of mood entries averaging 3.4.',
  sections: [{ heading: 'Mood', body: 'The average was 3.4 across 14 days.' }],
  noticed: ['Mood averaged 3.4.'],
  questions: ['What made the Tuesday different?'],
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => (data += chunk))
    req.on('end', () => resolve(data))
  })
}

const server = http.createServer(async (req, res) => {
  const body = await readBody(req)
  const send = (status, json) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(json))
  }
  const token = (req.headers.authorization ?? '').replace('Bearer ', '')

  if (req.url === '/auth/v1/user') {
    if (!token.startsWith('tok-')) return send(401, { message: 'invalid JWT' })
    return send(200, { id: `user-${token.slice(4)}`, email: null })
  }
  if (req.url === '/rest/v1/rpc/may_view_student') return send(200, stub.mayView)
  if (req.url === '/rest/v1/rpc/claim_report_slot') {
    calls.slots += 1
    return stub.slotStatus === 200 ? send(200, stub.slot) : send(stub.slotStatus, { message: 'down' })
  }
  if (req.url.startsWith('/v1/messages')) {
    calls.anthropic.push(JSON.parse(body))
    return send(200, {
      id: 'msg_stub',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5',
      content: [{ type: 'text', text: JSON.stringify(REPORT) }],
      stop_reason: stub.stopReason,
      stop_sequence: null,
      usage: { input_tokens: 900, output_tokens: 400 },
    })
  }
  send(404, { message: `stub has no ${req.url}` })
})

let handler

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) delete process.env[name]
  process.env.SUPABASE_URL = base
  process.env.SUPABASE_ANON_KEY = 'stub-anon-key'
  process.env.ANTHROPIC_BASE_URL = base
  process.env.ANTHROPIC_API_KEY = 'stub-key-not-real'
  ;({ default: handler } = await import('../api/report.js'))
})

after(() => server.close())

function reset(overrides = {}) {
  Object.assign(stub, { slot: 'ok', slotStatus: 200, mayView: false, stopReason: 'end_turn' }, overrides)
  calls.anthropic = []
  calls.slots = 0
}

// Quiet the handler's own logging; the assertions say what matters.
function call({ method = 'POST', user, token, body } = {}) {
  const req = {
    method,
    headers: token ?? user ? { authorization: `Bearer ${token ?? `tok-${user}`}` } : {},
    body,
  }
  const res = {
    statusCode: 0,
    headers: {},
    payload: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(value) {
      this.payload = value
      return this
    },
  }
  const { error, info } = console
  console.error = console.info = () => {}
  return handler(req, res).finally(() => Object.assign(console, { error, info })).then(() => res)
}

const figures = { days: 14, moodAverage: 3.4, trend: 'steady', habits: [{ label: 'Habit 1', rate: 0.5 }] }

test('refuses anything but POST', async () => {
  reset()
  const res = await call({ method: 'GET' })
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'POST')
})

test('without a key it answers 503 and sends the browser to its own reading', async () => {
  reset()
  const key = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  try {
    const res = await call({ user: 'nokey', body: { figures } })
    assert.equal(res.statusCode, 503)
    assert.equal(res.payload.fallback, true)
  } finally {
    process.env.ANTHROPIC_API_KEY = key
  }
})

test('no token and a bad token are both 401', async () => {
  reset()
  assert.equal((await call({ body: { figures } })).statusCode, 401)
  assert.equal((await call({ token: 'forged', body: { figures } })).statusCode, 401)
  assert.equal(calls.anthropic.length, 0)
})

test('student-typed text is refused before a slot or a model call', async () => {
  reset()
  const res = await call({ user: 'typed', body: { figures: { ...figures, note: STUDENT_TEXT } } })
  assert.equal(res.statusCode, 400)
  assert.equal(res.payload.fallback, true)
  assert.equal(calls.slots, 0)
  assert.equal(calls.anthropic.length, 0)
})

test('an oversized body is 413', async () => {
  reset()
  const big = { figures: { series: Array.from({ length: 20000 }, (_, i) => i) } }
  assert.equal((await call({ user: 'big', body: big })).statusCode, 413)
  assert.equal(calls.anthropic.length, 0)
})

test('a report about someone the caller may not view is 403, and costs no slot', async () => {
  reset({ mayView: false })
  const res = await call({ user: 'teacher', body: { figures, subjectUserId: OTHER_STUDENT } })
  assert.equal(res.statusCode, 403)
  assert.equal(calls.slots, 0)
})

test('an exhausted slot is 429 with the reader-facing sentence, and no model call', async () => {
  reset({ slot: 'user_limit' })
  const res = await call({ user: 'limited', body: { figures } })
  assert.equal(res.statusCode, 429)
  assert.match(res.payload.error, /three readings today/)
  assert.equal(calls.anthropic.length, 0)
})

test('if the slot cannot be checked it fails closed', async () => {
  reset({ slotStatus: 500 })
  const res = await call({ user: 'dbdown', body: { figures } })
  assert.equal(res.statusCode, 503)
  assert.equal(res.payload.fallback, true)
  assert.equal(calls.anthropic.length, 0)
})

test('the happy path writes a reading from figures only', async () => {
  reset()
  const res = await call({ user: 'happy', body: { figures, excerpts: [STUDENT_TEXT] } })
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.source, 'claude')
  assert.equal(res.payload.title, REPORT.title)
  assert.equal(res.headers['cache-control'], 'no-store, private')
  assert.equal(calls.slots, 1)
  assert.equal(calls.anthropic.length, 1)
  const sent = calls.anthropic[0]
  assert.equal(sent.model, 'claude-sonnet-5')
  assert.equal(sent.max_tokens, 4000)
  assert.ok(!JSON.stringify(sent).includes(STUDENT_TEXT), 'excerpts must never reach the model')
})

test('a refusal from the model falls back to the browser', async () => {
  reset({ stopReason: 'refusal' })
  const res = await call({ user: 'refused', body: { figures } })
  assert.equal(res.statusCode, 422)
  assert.equal(res.payload.fallback, true)
})

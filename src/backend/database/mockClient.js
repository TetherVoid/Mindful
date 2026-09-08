// A local stand-in for the Supabase client, used only when
// VITE_USE_FIXTURES=true. It implements the slice of the PostgREST builder
// this app actually calls — see the call sites in pages/ and context/ — and
// nothing else.
//
// It is deliberately a little strict: `.select('a, b')` really does project to
// those columns, so a component that reads a field it never selected gets
// `undefined` here exactly as it would against the real database. A mock that
// always returned whole rows would hide that class of bug.

import { buildFixtureTables } from './fixtures'

// Simulated request latency, so loading states are actually visible. Set by
// createMockClient() from @config/env rather than read here, so that config
// module stays the single place the app touches import.meta.env.
let LATENCY_MS = 220

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

let idCounter = 0
function nextId(prefix) {
  idCounter += 1
  return `${prefix}-new-${idCounter}`
}

function projectRow(row, columns) {
  if (!columns || columns === '*') return clone(row)
  const picked = {}
  for (const raw of columns.split(',')) {
    const key = raw.trim()
    if (key && key !== '*') picked[key] = row[key]
  }
  return clone(picked)
}

// PostgREST `.or()` looks like:  situation.ilike."%x%",automatic_thought.ilike."%x%"
// The value may itself be quoted and contain commas, so match whole clauses
// rather than splitting the string on commas.
const OR_CLAUSE = /(\w+)\.(ilike|eq)\.("(?:[^"\\]|\\.)*"|[^,]+)/g

function unquote(value) {
  const trimmed = value.trim()
  if (!trimmed.startsWith('"')) return trimmed
  return trimmed.slice(1, -1).replace(/\\(.)/g, '$1')
}

function matchesOr(row, filter) {
  const clauses = [...filter.matchAll(OR_CLAUSE)]
  if (clauses.length === 0) return true
  return clauses.some(([, column, op, rawValue]) => {
    const value = unquote(rawValue)
    const cell = row[column]
    if (cell == null) return false
    if (op === 'eq') return String(cell) === value
    // ilike: % is the wildcard, comparison is case-insensitive
    const pattern = new RegExp(
      '^' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$',
      'i'
    )
    return pattern.test(String(cell))
  })
}

class QueryBuilder {
  constructor(store, table) {
    this.store = store
    this.table = table
    this.columns = '*'
    this.wantCount = false
    this.headOnly = false
    this.filters = []
    this.orFilter = null
    this.sort = null
    this.max = null
    this.wantSingle = false
    this.operation = 'select'
    this.payload = null
  }

  select(columns = '*', options = {}) {
    this.columns = columns
    if (options.count) this.wantCount = true
    if (options.head) this.headOnly = true
    // `.insert(...).select()` switches the return shape but keeps the write.
    if (this.operation === 'select') this.operation = 'select'
    return this
  }

  eq(column, value) {
    this.filters.push((row) => String(row[column]) === String(value))
    return this
  }

  or(filter) {
    this.orFilter = filter
    return this
  }

  order(column, { ascending = true } = {}) {
    this.sort = { column, ascending }
    return this
  }

  limit(n) {
    this.max = n
    return this
  }

  single() {
    this.wantSingle = true
    return this
  }

  insert(payload) {
    this.operation = 'insert'
    this.payload = payload
    return this
  }

  update(payload) {
    this.operation = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.operation = 'delete'
    return this
  }

  matchingRows() {
    const rows = this.store[this.table] ?? []
    return rows.filter(
      (row) =>
        this.filters.every((test) => test(row)) &&
        (this.orFilter ? matchesOr(row, this.orFilter) : true)
    )
  }

  run() {
    const rows = this.store[this.table]
    if (!rows) {
      return { data: null, error: { message: `relation "${this.table}" does not exist` }, count: null }
    }

    if (this.operation === 'insert') {
      const now = new Date().toISOString()
      const created = {
        id: nextId(this.table),
        created_at: now,
        archived: false,
        ...this.payload,
      }
      rows.push(created)
      const data = this.wantSingle ? clone(created) : [clone(created)]
      return { data, error: null, count: null }
    }

    if (this.operation === 'update') {
      const targets = this.matchingRows()
      for (const row of targets) Object.assign(row, this.payload)
      return { data: targets.map(clone), error: null, count: targets.length }
    }

    if (this.operation === 'delete') {
      const doomed = new Set(this.matchingRows())
      this.store[this.table] = rows.filter((row) => !doomed.has(row))
      return { data: null, error: null, count: doomed.size }
    }

    let result = this.matchingRows()
    const count = this.wantCount ? result.length : null

    if (this.sort) {
      const { column, ascending } = this.sort
      result = [...result].sort((a, b) => {
        const av = a[column]
        const bv = b[column]
        if (av === bv) return 0
        return (av > bv ? 1 : -1) * (ascending ? 1 : -1)
      })
    }

    if (this.max != null) result = result.slice(0, this.max)
    if (this.headOnly) return { data: null, error: null, count }

    const data = result.map((row) => projectRow(row, this.columns))
    if (this.wantSingle) {
      return data.length
        ? { data: data[0], error: null, count }
        : { data: null, error: { message: 'No rows found' }, count }
    }
    return { data, error: null, count }
  }

  // Awaiting the builder is what fires the query, exactly as with the real
  // client — there is no .execute() to forget.
  then(onFulfilled, onRejected) {
    return sleep(LATENCY_MS)
      .then(() => this.run())
      .then(onFulfilled, onRejected)
  }
}

const LOCAL_USER = {
  id: 'local-user',
  email: 'sam@example.com',
  user_metadata: {},
}

function makeSession() {
  return {
    access_token: 'local-fixture-token',
    token_type: 'bearer',
    user: LOCAL_USER,
  }
}

export function createMockClient(scenario, { startSignedIn = true, latencyMs } = {}) {
  if (Number.isFinite(latencyMs)) LATENCY_MS = latencyMs
  const store = buildFixtureTables(scenario)
  let session = startSignedIn ? makeSession() : null
  const listeners = new Set()

  function emit(event) {
    for (const listener of listeners) listener(event, session)
  }

  return {
    __isFixtureClient: true,
    from(table) {
      return new QueryBuilder(store, table)
    },
    auth: {
      async getSession() {
        await sleep(60)
        return { data: { session }, error: null }
      },
      onAuthStateChange(callback) {
        listeners.add(callback)
        return {
          data: {
            subscription: {
              unsubscribe() {
                listeners.delete(callback)
              },
            },
          },
        }
      },
      async signInWithPassword({ email }) {
        await sleep(LATENCY_MS)
        session = { ...makeSession(), user: { ...LOCAL_USER, email: email || LOCAL_USER.email } }
        emit('SIGNED_IN')
        return { data: { session, user: session.user }, error: null }
      },
      async signUp({ email }) {
        await sleep(LATENCY_MS)
        session = { ...makeSession(), user: { ...LOCAL_USER, email: email || LOCAL_USER.email } }
        emit('SIGNED_IN')
        return { data: { session, user: session.user }, error: null }
      },
      async signOut() {
        await sleep(120)
        session = null
        emit('SIGNED_OUT')
        return { error: null }
      },
      async updateUser() {
        await sleep(LATENCY_MS)
        return { data: { user: session?.user ?? LOCAL_USER }, error: null }
      },
    },
  }
}

#!/usr/bin/env node
// PreToolUse guard: files Claude must never change.
//
//   1. Committed migrations. A file in supabase/migrations/ that is in git's
//      HEAD may already be on production, and production only ever receives
//      new files, so changing one would make the repo describe a database that
//      does not exist. A new, uncommitted file is fair game until committed.
//   2. The guards themselves: .claude/settings.json, .claude/settings.local.json,
//      scripts/hooks/, and scripts/lint-baseline.json (which only `npm run
//      verify` may lower). A guard Claude can edit is not a guard. When one is
//      wrong, Claude says what to change and the human changes it.
//
// It also refuses a new migration whose name is malformed or whose timestamp
// does not sort after every committed one, because `supabase db push` applies
// files in name order.
//
// Wired in .claude/settings.json for Edit, Write, MultiEdit, NotebookEdit and
// Bash. For Bash, a command that names a protected file is allowed only if it
// just reads it (cat, grep, git diff, cp *from* it, …); anything else that
// names one is blocked, and so is a patch (git apply, patch) that touches one.
// Names are compared case-insensitively, as macOS resolves them.
//
// Exit 2 blocks the tool call and shows stderr to Claude. Anything unexpected
// (unreadable input, git missing) blocks too: a guard that fails open is not one.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseCommands, normalise } from './lib/shell.mjs'

const DIR = 'supabase/migrations'
const NAME = /^\d{14}_[a-z0-9_]+\.sql$/
const GUARD_FILES = ['.claude/settings.json', '.claude/settings.local.json', 'scripts/lint-baseline.json']
const GUARD_DIRS = ['scripts/hooks/']

function block(message) {
  process.stderr.write(`guard-migrations: ${message}\n`)
  process.exit(2)
}

let input
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  block('could not read the hook input; refusing to guess.')
}

const root = input.cwd || process.cwd()
let repo
let committed
try {
  repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim()
  committed = new Set(
    execFileSync('git', ['ls-tree', '--name-only', 'HEAD', `${DIR}/`], { cwd: repo, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => path.basename(f).toLowerCase())
  )
} catch {
  block('could not list committed migrations with git.')
}

const latest = [...committed].sort().at(-1) ?? ''

/** Repo-relative, forward slashes, lower case; null if outside the repo. */
function rel(p, base = root) {
  const r = path.relative(repo, path.resolve(base, String(p))).split(path.sep).join('/')
  return r.startsWith('..') ? null : r.toLowerCase()
}

/** What a path is to this guard: a guard file, a committed migration, the migrations dir, a new migration. */
function classify(p, base) {
  const r = rel(p, base)
  if (r == null) return null
  if (GUARD_FILES.includes(r) || GUARD_DIRS.some((d) => r.startsWith(d) || `${r}/` === d)) return 'guard'
  if (r === '.claude' || r === 'scripts') return 'guard'
  if (r === DIR || r === `${DIR}/*` || r.startsWith(`${DIR}/*`)) return 'dir'
  if (r.startsWith(`${DIR}/`)) {
    const name = r.slice(DIR.length + 1)
    if (committed.has(name)) return 'committed'
    return name.includes('/') ? null : 'new'
  }
  // A bare file name, run from inside supabase/migrations/.
  if (committed.has(path.basename(r)) && rel(base) === DIR) return 'committed'
  return null
}

function refuse(kind, what) {
  if (kind === 'guard') {
    block(`${what} is part of the guard layer. Tell the human what to change and why; they edit it.`)
  }
  if (kind === 'committed' || kind === 'dir') {
    block(
      `${what} would change committed migrations, which may already be on production. ` +
        'Write a new file in supabase/migrations/ instead (see the migration-checklist skill).'
    )
  }
}

function checkNewName(p, base) {
  const r = rel(p, base)
  const name = r.slice(DIR.length + 1)
  if (existsSync(path.join(repo, r))) return
  if (!NAME.test(name)) block(`${name} must look like YYYYMMDDHHMMSS_what_it_does.sql.`)
  if (name <= latest) block(`${name} sorts before ${latest}; a new migration's timestamp must be later.`)
}

function checkWriteTarget(p, base, what) {
  const kind = classify(p, base)
  if (kind === 'new') checkNewName(p, base)
  else refuse(kind, what)
}

// Programs that only read the files they are given. Everything else that names
// a protected path is assumed to be able to change it.
const READERS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'bat', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'wc', 'diff',
  'cmp', 'ls', 'stat', 'file', 'md5', 'shasum', 'sha256sum', 'sort', 'uniq', 'cut', 'jq', 'nl',
  'du', 'find', 'tree', 'realpath', 'readlink', 'basename', 'dirname', 'echo', 'printf', 'test',
  '[', 'code', 'open', 'psql',
])
const GIT_READERS = new Set(['diff', 'show', 'log', 'blame', 'status', 'ls-files', 'ls-tree', 'grep', 'cat-file', 'add', 'commit'])

function checkBash(cmd) {
  let cwd = root
  for (const command of parseCommands(cmd)) {
    const { name, args: rest } = normalise(command.words)

    // Track `cd` so relative paths resolve the way the shell would.
    if (name === 'cd' && rest[0]) {
      cwd = path.resolve(cwd, rest[0])
      continue
    }

    for (const out of command.outs) checkWriteTarget(out, cwd, `writing to ${out}`)

    if (name === 'tee') rest.filter((a) => !a.startsWith('-')).forEach((a) => checkWriteTarget(a, cwd, `tee ${a}`))
    if (name === 'dd') rest.filter((a) => a.startsWith('of=')).forEach((a) => checkWriteTarget(a.slice(3), cwd, a))

    // Patches name their files inside the patch, not on the command line.
    const isPatch = name === 'patch' || (name === 'git' && ['apply', 'am'].includes(rest.find((a) => !a.startsWith('-'))))
    if (isPatch) {
      const files = rest.filter((a) => !a.startsWith('-') && !['apply', 'am'].includes(a))
      let text = command.heredoc
      for (const f of files) {
        try {
          text += readFileSync(path.resolve(cwd, f), 'utf8')
        } catch {
          block(`could not read ${f} to see which files the patch changes.`)
        }
      }
      if (!text.trim()) block('a patch from stdin cannot be checked; apply it from a file.')
      for (const [, target] of text.matchAll(/^(?:\+\+\+|---|diff --git) (?:[ab]\/)?(\S+)/gm)) {
        const kind = classify(target, repo)
        if (kind && kind !== 'new') refuse(kind, `a patch touching ${target}`)
      }
      continue
    }

    // `cp` only writes its last argument; its sources are read. `mv` writes
    // its last argument and removes its sources.
    if (['cp', 'install', 'mv'].includes(name)) {
      const operands = rest.filter((a) => !a.startsWith('-'))
      if (operands.length >= 2) checkWriteTarget(operands.at(-1), cwd, `${name} onto ${operands.at(-1)}`)
      if (name === 'mv') {
        for (const source of operands.slice(0, -1)) {
          const kind = classify(source, cwd)
          if (kind && kind !== 'new') refuse(kind, `mv ${source}`)
        }
      }
      continue
    }

    const reads =
      READERS.has(name) ||
      (name === 'git' && GIT_READERS.has(rest.find((a) => !a.startsWith('-')))) ||
      (name === 'sed' && !rest.some((a) => /^-[a-zA-Z]*i/.test(a) || a === '--in-place')) ||
      (name === 'awk' && !rest.some((a) => a === '-i' || a.startsWith('--inplace'))) ||
      (name === 'node' && rest[0] && !rest[0].startsWith('-'))
    if (reads) continue

    // Any other program that names a protected path — interpreters, rm, mv,
    // chmod, truncate, git checkout/restore/rm — is assumed to change it. The
    // path may sit inside an argument (python -c "open('…', 'w')").
    for (const arg of rest) {
      for (const token of arg.split(/[\s'"(),=;]+/)) {
        if (!token) continue
        const kind = classify(token, cwd)
        if (kind && kind !== 'new') refuse(kind, `${name} on ${token}`)
      }
    }
  }
}

const tool = input.tool_name
const args = input.tool_input ?? {}

if (tool === 'Write') checkWriteTarget(args.file_path, root, args.file_path)
else if (tool === 'Edit' || tool === 'MultiEdit') refuse(classify(args.file_path, root), args.file_path)
else if (tool === 'NotebookEdit') refuse(classify(args.notebook_path, root), args.notebook_path)
else if (tool === 'Bash') checkBash(String(args.command ?? ''))

process.exit(0)

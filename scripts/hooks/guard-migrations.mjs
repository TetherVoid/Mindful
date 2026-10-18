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
// names one is blocked, and so is a patch (git apply, patch) that touches one,
// `xargs` fed protected paths, `rm`/`git checkout`/`find -delete` on a folder
// that holds them (`.`, `supabase`), and git commands that move HEAD or
// rewrite history (checkout <ref>, reset --hard, revert, rebase, …).
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

/**
 * What a path is to this guard: a guard file, a committed migration, the
 * migrations dir, a new migration, or nothing. With `ancestors`, a directory
 * that contains protected files (`.`, `supabase`, `scripts`, `.claude`) counts
 * too — right for `rm -rf` or `git checkout -- .`, wrong for `graphify update .`.
 */
function classify(p, base, ancestors = false) {
  const r = rel(p, base)
  if (r == null) return null
  if (GUARD_FILES.includes(r) || GUARD_DIRS.some((d) => r.startsWith(d) || `${r}/` === d)) return 'guard'
  if (ancestors) {
    const dir = r === '*' ? '' : r.replace(/\/\*$/, '')
    const under = (p) => dir === '' || p.startsWith(`${dir}/`)
    if ([...GUARD_FILES, ...GUARD_DIRS].some(under)) return 'guard'
    if (under(`${DIR}/`)) return 'dir'
  }
  if (r === DIR || r === `${DIR}/*` || r.startsWith(`${DIR}/*`)) return 'dir'
  if (r.startsWith(`${DIR}/`)) {
    const name = r.slice(DIR.length + 1)
    // A glob, a variable or a command substitution ($SUB) can stand for any
    // file in the folder: supabase/migrations/2026*.sql.
    if (/[*?[$]/.test(name)) return 'dir'
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
// `claude` is here because a child session runs under these same hooks;
// guard-remote refuses the flags that would start one without them.
const READERS = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'bat', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'wc', 'diff',
  'cmp', 'ls', 'stat', 'file', 'md5', 'shasum', 'sha256sum', 'sort', 'uniq', 'cut', 'jq', 'nl',
  'du', 'find', 'tree', 'realpath', 'readlink', 'basename', 'dirname', 'echo', 'printf', 'test',
  '[', 'code', 'open', 'psql', 'claude',
])
const GIT_READERS = new Set(['diff', 'show', 'log', 'blame', 'status', 'ls-files', 'ls-tree', 'grep', 'cat-file', 'add', 'commit'])
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])
const FIND_ACTIONS = /^-(delete|exec|execdir|ok|okdir|fprint|fprint0|fprintf|fls)$/

function gitSub(gitArgs) {
  for (let i = 0; i < gitArgs.length; i += 1) {
    if (GIT_VALUE_OPTS.has(gitArgs[i])) i += 1
    else if (!gitArgs[i].startsWith('-')) return { sub: gitArgs[i], after: gitArgs.slice(i + 1) }
  }
  return { sub: null, after: [] }
}

/** Programs that change or remove the paths they are given — where `.` or `supabase` means everything under it. */
function changesTree(name, rest) {
  if (['rm', 'rmdir', 'mv', 'chmod', 'chown', 'chgrp', 'truncate', 'shred', 'unlink', 'rsync', 'touch'].includes(name)) return true
  if (name === 'git') return ['checkout', 'restore', 'rm', 'clean', 'reset', 'mv', 'switch'].includes(gitSub(rest).sub)
  if (name === 'find') return rest.some((a) => FIND_ACTIONS.test(a))
  if (['sed', 'perl', 'ruby'].includes(name)) return rest.some((a) => /^-[a-zA-Z]*i/.test(a) || a === '--in-place')
  if (name === 'tar') return rest.some((a) => /^-?[a-zA-Z]*x/.test(a))
  return false
}

/**
 * Moving HEAD or rewriting history puts older (or other) versions of every
 * tracked file in place — committed migrations and the guards included.
 */
function checkGitHistory(rest, cwd) {
  const { sub, after } = gitSub(rest)
  const why = `git ${sub} moves HEAD or rewrites history, which can change committed migrations and the guards. Ask the human.`
  if (['revert', 'rebase', 'cherry-pick', 'pull', 'merge'].includes(sub)) block(why)
  if (sub === 'reset' && after.some((a) => /^--(hard|merge|keep)$/.test(a))) block(why)
  if (sub === 'switch') {
    const create = after.findIndex((a) => /^-[cC]$|^--(create|force-create)$/.test(a))
    const operands = after.filter((a) => !a.startsWith('-'))
    if (create === -1 || operands.length > 1) block(why)
  }
  if (sub === 'checkout') {
    const dashes = after.indexOf('--')
    if (dashes !== -1) return // paths follow; the path checks below cover them
    const create = after.findIndex((a) => /^-[bB]$/.test(a))
    const operands = after.filter((a) => !a.startsWith('-'))
    if (create !== -1) {
      if (operands.length > 1) block(why) // a start point other than HEAD
      return
    }
    // Without --, an operand that is not a path on disk is a branch or commit.
    if (operands.some((a) => !existsSync(path.resolve(cwd, a)))) block(why)
  }
}

const tokensOf = (list) => list.flatMap((arg) => arg.split(/[\s'"(),=;]+/)).filter(Boolean)
const isProtected = (t, base = root) => {
  const kind = classify(t, base, true)
  return kind && kind !== 'new'
}
const SHELL_KEYWORD = /^(do|done|then|else|elif|if|while|until|fi|!|\{|\})$/

function readsOnly(name, rest) {
  return (
    (READERS.has(name) && !(name === 'find' && rest.some((a) => FIND_ACTIONS.test(a)))) ||
    (name === 'git' && GIT_READERS.has(gitSub(rest).sub)) ||
    (name === 'sed' && !rest.some((a) => /^-[a-zA-Z]*i/.test(a) || a === '--in-place')) ||
    (name === 'awk' && !rest.some((a) => a === '-i' || a.startsWith('--inplace'))) ||
    (name === 'node' && rest[0] && !rest[0].startsWith('-'))
  )
}

/**
 * `for f in LIST; do BODY; done`: the shell runs BODY once per word of LIST
 * with $f set to it. `body` is the range of commands from `do` to the
 * matching `done` (to the end of the call if there is none).
 */
function loopsOf(commands) {
  const loops = []
  commands.forEach((c, i) => {
    const { name, args, wrappers } = normalise(c.words)
    if (name !== 'for' || wrappers.length || args[1] !== 'in' || !/^[A-Za-z_]\w*$/.test(args[0] ?? '')) return
    let depth = 0
    let end = commands.length
    for (let j = i + 1; j < commands.length; j += 1) {
      const first = commands[j].words[0]
      if (first === 'do') depth += 1
      else if (first === 'done' && (depth -= 1) <= 0) {
        end = j
        break
      }
    }
    // An empty list leaves $f unknown, like a command substitution.
    const values = args.slice(2).length ? args.slice(2) : ['$SUB']
    loops.push({ at: i, variable: args[0], values, body: [i + 1, end] })
  })
  return loops
}

/**
 * One copy of the command per value of each loop variable it uses. Inner
 * loops first, so `for g in $f` inside `for f in …` ends up with real paths.
 */
function expandLoops(command, loops) {
  let variants = [command]
  for (const { variable, values } of [...loops].reverse()) {
    const ref = `\\$(\\{${variable}\\}|${variable}(?![A-Za-z0-9_]))`
    const uses = (c) => [...c.words, ...c.outs, c.heredoc].some((w) => new RegExp(ref).test(w))
    const put = (w, v) => w.replace(new RegExp(ref, 'g'), () => v)
    variants = variants.flatMap((c) =>
      uses(c)
        ? values.map((v) => ({
            ...c,
            words: c.words.map((w) => put(w, v)),
            outs: c.outs.map((w) => put(w, v)),
            heredoc: put(c.heredoc, v),
          }))
        : [c]
    )
    if (variants.length > 500) block('that loop expands to too many commands to check; name the files directly.')
  }
  return variants
}

/** `cd DIR` with one plain target: no option, $, ~ or -, and no assignment in front. */
function plainCd(words) {
  const args = words.slice(1)
  return words[0] === 'cd' && args.length === 1 && !/^-|[$~]/.test(args[0])
}

// The only programs a read-only loop may run. Narrower than READERS on
// purpose: awk, sort -o, rg --pre, git diff --output, tree -o, uniq OUT and
// sed's w command can all write, so none of them is here. sed is allowed only
// as `sed -n 1,3p FILE…`.
const LOOP_READERS = new Set([
  'cat', 'head', 'tail', 'wc', 'grep', 'egrep', 'fgrep', 'ls', 'stat', 'diff', 'cmp', 'md5',
  'shasum', 'sha256sum', 'cut', 'nl', 'basename', 'dirname', 'realpath', 'readlink', 'echo', 'printf',
  'test', '[',
])
function loopReads(name, args) {
  if (name === 'printf') return !args.some((a) => a.startsWith('-v'))
  if (LOOP_READERS.has(name)) return true
  if (name !== 'sed') return false
  // Script (the first operand): only N,Mp. Every other argument is -n or a
  // file; GNU sed also reads options after the script (`1p -e 'w x'`).
  const script = args.findIndex((a) => !a.startsWith('-'))
  return (
    script !== -1 &&
    /^[0-9,]+p$/.test(args[script]) &&
    args.every((a, i) => i === script || a === '-n' || !a.startsWith('-'))
  )
}
const FORBIDDEN = new Set(['eval', 'source', '.', 'alias', 'pushd', 'popd', 'exec', 'xargs', 'read', 'function'])

/** The text of every $(…) and `…` in the call (more than the shell would run, never less). */
function substitutions(cmd) {
  const found = []
  for (let i = 0; i < cmd.length; i += 1) {
    if (cmd[i] === '`') {
      const end = cmd.indexOf('`', i + 1)
      if (end === -1) return null
      found.push(cmd.slice(i + 1, end))
      i = end
    } else if (cmd[i] === '$' && cmd[i + 1] === '(') {
      let level = 1
      let j = i + 2
      for (; j < cmd.length && level; j += 1) {
        if (cmd[j] === '(') level += 1
        else if (cmd[j] === ')') level -= 1
      }
      if (level) return null
      found.push(cmd.slice(i + 2, j - 1))
      i = j - 1
    }
  }
  return found
}

/**
 * A loop over protected paths is allowed only when the WHOLE call can do
 * nothing but read: every command is a reader, a plain `cd`, `cp`/`install`
 * (whose target is checked as usual), the loop header, or a bare keyword; no
 * functions, assignments, IFS/CDPATH, eval/source/alias/pushd/popd/exec/
 * xargs/read/printf -v; no quoted or escaped do/done (which would end the body
 * where bash does not); and no $ other than the loop variables and $(ls …) /
 * $(find …) without actions. Anything it cannot tell, it refuses.
 */
function readOnlyLoopCall(cmd, commands, loops) {
  const variables = new Set(loops.map((l) => l.variable))
  if (/\b(IFS|CDPATH)\b/.test(cmd)) return false
  if (/\bfunction\b|[A-Za-z_][\w.:-]*\s*\(\s*\)/.test(cmd)) return false
  // "done", 'do', \done, a line continuation before done, or `done)` in a case.
  if (/(['"]|\\\n?)[ \t]*(do|done)\b|\b(do|done)[ \t]*['"]|\bdone[ \t]*\)/.test(cmd)) return false
  if ((cmd.match(/\bdone\b/g) ?? []).length !== loops.length) return false
  if ((cmd.match(/\bdo\b/g) ?? []).length !== loops.length) return false
  for (const [, use] of cmd.matchAll(/\$(\{[^}]*\}?|[A-Za-z_]\w*|\(|.?)/g)) {
    if (use === '(') continue
    const plain = use.replace(/^\{(.*)\}$/, '$1')
    if (!variables.has(plain)) return false
  }
  const subs = substitutions(cmd)
  if (subs == null) return false
  for (const sub of subs) {
    for (const c of parseCommands(sub)) {
      const { name, args, wrappers } = normalise(c.words)
      if (wrappers.length || c.outs.length) return false
      if (name === 'ls') continue
      if (name === 'find' && !args.some((a) => FIND_ACTIONS.test(a))) continue
      return false
    }
  }
  for (const c of commands) {
    if (c.words.every((w) => ['for', 'do', 'done', 'in'].includes(w))) continue
    const words = c.words.filter((w) => !SHELL_KEYWORD.test(w))
    if (/^[A-Za-z_]\w*=/.test(words[0] ?? '')) return false // NAME=… (alone or before a command)
    const { name, args, wrappers } = normalise(c.words)
    if (wrappers.length || FORBIDDEN.has(name)) return false
    if (name === 'printf' && args.some((a) => a.startsWith('-v'))) return false
    if (name === 'for' && args[1] === 'in' && variables.has(args[0])) continue
    if (name === 'done') continue
    if (name === 'cd') {
      if (plainCd(words)) continue
      return false
    }
    if (['cp', 'install'].includes(name)) continue
    if (!loopReads(name, args)) return false
  }
  return true
}

function checkBash(cmd) {
  const commands = parseCommands(cmd)

  // `ls supabase/migrations/*.sql | xargs rm`: the paths reach rm on stdin, so
  // look for them anywhere in the call.
  const mentionsProtected = commands.some((c) => tokensOf(normalise(c.words).args).some((t) => isProtected(t)))
  // The same, but not counting the repo root (`npx oxlint . $(…)` is ordinary).
  const namesProtected = commands.some((c) =>
    tokensOf(normalise(c.words).args).some((t) => rel(t) !== '' && rel(t) !== '*' && isProtected(t))
  )

  const loops = loopsOf(commands)
  // A loop over protected paths is refused, as it always was, unless the whole
  // call only reads (readOnlyLoopCall).
  const loopWaived = loops.length > 0 && readOnlyLoopCall(cmd, commands, loops)
  // pushd/popd and CDPATH move the shell in ways `cd` tracking cannot follow.
  let cwdUnknown = /\b(pushd|popd|CDPATH)\b/.test(cmd)

  let cwd = root
  for (const command of commands.flatMap((c) => expandLoops(c, loops))) {
    const { name, args: rest, wrappers } = normalise(command.words)
    if (name === 'git') checkGitHistory(rest, cwd)

    // Track `cd` so relative paths resolve the way the shell would. A target
    // that cannot be read (an option, $VAR, ~, -, or more than one) or a `cd`
    // with an assignment in front leaves the folder unknown.
    if (name === 'cd' && rest[0]) {
      if (!plainCd(command.words)) cwdUnknown = true
      cwd = path.resolve(cwd, rest[0])
      continue
    }

    // `rm $(ls supabase/migrations/*.sql)`: the paths come from a command
    // substitution ($SUB), which, like xargs, hides them.
    const fromSub = (list) => namesProtected && list.some((a) => a.includes('$SUB'))
    if (fromSub(command.outs)) block('a redirect to a path from $(…) in a call that names protected paths cannot be checked.')
    for (const out of command.outs) checkWriteTarget(out, cwd, `writing to ${out}`)

    // A loop header is checked like any other command below (its list names
    // the paths), and also from the repo root and when the folder is unknown,
    // unless the whole call only reads.
    if (name === 'for') {
      if (loopWaived) continue
      const list = tokensOf(rest.slice(2))
      if (cwdUnknown && list.length) refuse('dir', `a loop after a change of folder the guard cannot follow`)
      for (const token of list) {
        const kind = classify(token, root)
        if (kind && kind !== 'new') refuse(kind, `${name} on ${token}`)
      }
    }

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
      if (fromSub(name === 'mv' ? operands : operands.slice(-1))) {
        block(`${name} with a path from $(…) in a call that names protected paths cannot be checked.`)
      }
      // A recursive copy onto `.` or `scripts` can overwrite what is under it.
      const recursive = rest.some((a) => /^-[a-zA-Z]*[rRa]/.test(a))
      if (operands.length >= 2) {
        const target = operands.at(-1)
        const kind = classify(target, cwd, recursive)
        if (kind === 'new') checkNewName(target, cwd)
        else refuse(kind, `${name} onto ${target}`)
      }
      if (name === 'mv') {
        for (const source of operands.slice(0, -1)) {
          const kind = classify(source, cwd, true)
          if (kind && kind !== 'new') refuse(kind, `mv ${source}`)
        }
      }
      continue
    }

    if (readsOnly(name, rest)) continue

    if (wrappers.includes('xargs') && mentionsProtected) {
      block(`xargs ${name} would get protected paths on stdin (committed migrations or guard files).`)
    }
    if (fromSub(rest)) block(`${name} would get paths from $(…) in a call that names protected paths; name them directly.`)

    // Any other program that names a protected path — interpreters, rm, mv,
    // chmod, truncate, git checkout/restore/rm — is assumed to change it. The
    // path may sit inside an argument (python -c "open('…', 'w')") or in the
    // code an interpreter reads from a heredoc (python3 - <<EOF).
    const ancestors = changesTree(name, rest)
    const tokens = tokensOf(command.stdinCode ? [...rest, command.heredoc] : rest)
    for (const token of tokens) {
      const kind = classify(token, cwd, ancestors)
      if (kind && kind !== 'new') refuse(kind, `${name} on ${token}`)
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

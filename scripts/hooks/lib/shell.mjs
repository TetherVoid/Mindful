// Just enough of a shell parser for the guards to see what a Bash call runs.
//
// Regexes over the raw string both miss things (`npx supabase@latest db push`,
// `sh -c '…'`, a full path to the binary) and catch things they shouldn't (a
// commit message that mentions `git push`). So the command line is split into
// simple commands the way a shell would — respecting quotes, heredocs, `$(…)`
// and backticks — and each is normalised to the program that actually runs.
//
// It is not a full shell. When in doubt it errs towards reporting more
// commands, never fewer: the guards block on what they see.

const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')'])

/**
 * @returns {{words: string[], outs: string[], heredoc: string}[]}
 *   one entry per simple command, including those inside $(…), backticks,
 *   `sh -c '…'` and `eval …`. `outs` are redirect targets (> and >>).
 */
export function parseCommands(input, depth = 0) {
  const commands = []
  if (depth > 6) return commands
  let words = []
  let outs = []
  let heredocs = []
  let heredoc = ''
  let word = ''
  let inWord = false
  let quote = null
  let nextIsOut = false
  let nextIsHeredocTag = false

  const endWord = () => {
    if (!inWord) return
    if (nextIsHeredocTag) {
      heredocs.push(word)
      nextIsHeredocTag = false
    } else if (nextIsOut) {
      outs.push(word)
      nextIsOut = false
    } else {
      words.push(word)
    }
    word = ''
    inWord = false
  }
  const endCommand = () => {
    endWord()
    if (words.length || outs.length) commands.push({ words, outs, heredoc })
    words = []
    outs = []
    heredoc = ''
  }
  // Find the ) that closes a $( opened just before index i.
  const closeParen = (i) => {
    let level = 1
    let q = null
    for (let j = i; j < input.length; j += 1) {
      const c = input[j]
      if (q) {
        if (c === q) q = null
        continue
      }
      if (c === "'" || c === '"') q = c
      else if (c === '(') level += 1
      else if (c === ')' && (level -= 1) === 0) return j
    }
    return input.length
  }

  for (let i = 0; i < input.length; i += 1) {
    const c = input[i]

    if (quote === "'") {
      if (c === "'") quote = null
      else word += c
      continue
    }
    if (c === '\\' && i + 1 < input.length) {
      word += input[i + 1]
      inWord = true
      i += 1
      continue
    }
    if (c === '$' && input[i + 1] === '(') {
      const end = closeParen(i + 2)
      commands.push(...parseCommands(input.slice(i + 2, end), depth + 1))
      word += '$SUB'
      inWord = true
      i = end
      continue
    }
    if (c === '`') {
      const end = input.indexOf('`', i + 1)
      const stop = end === -1 ? input.length : end
      commands.push(...parseCommands(input.slice(i + 1, stop), depth + 1))
      word += '$SUB'
      inWord = true
      i = stop
      continue
    }
    if (quote === '"') {
      if (c === '"') quote = null
      else word += c
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      inWord = true
      continue
    }
    if (c === '<' && input[i + 1] === '<' && input[i + 2] !== '<') {
      endWord()
      i += input[i + 2] === '-' ? 2 : 1
      nextIsHeredocTag = true
      continue
    }
    if (c === '>') {
      // A descriptor number glued to > (the 2 in 2>file, 2>&1) is not an argument.
      if (inWord && /^\d+$/.test(word)) {
        word = ''
        inWord = false
      }
      endWord()
      if (input[i + 1] === '>') i += 1
      if (input[i + 1] === '&') {
        // >&2, 2>&1: a descriptor, not a file.
        i += 1
        while (/[0-9-]/.test(input[i + 1] ?? '')) i += 1
        continue
      }
      nextIsOut = true
      continue
    }
    if (c === '<') {
      endWord()
      continue
    }
    if (c === '\n') endWord() // closes a heredoc tag that ends the line
    if (c === '\n' && heredocs.length) {
      // The heredoc bodies start on the next line; they are data, not commands.
      endCommand()
      let rest = input.slice(i + 1)
      let body = ''
      for (const tag of heredocs) {
        const lines = rest.split('\n')
        const stop = lines.findIndex((line) => line.trim() === tag)
        const taken = stop === -1 ? lines : lines.slice(0, stop)
        body += `${taken.join('\n')}\n`
        rest = stop === -1 ? '' : lines.slice(stop + 1).join('\n')
      }
      if (commands.length) commands.at(-1).heredoc = body
      heredocs = []
      i = input.length - rest.length - 1
      continue
    }
    if (SEPARATORS.has(c)) {
      endCommand()
      continue
    }
    if (c === ' ' || c === '\t') {
      endWord()
      continue
    }
    word += c
    inWord = true
  }
  endCommand()

  // Look inside `sh -c '…'` and `eval …`.
  const nested = []
  for (const command of commands) {
    const { name, args } = normalise(command.words)
    if (['sh', 'bash', 'zsh', 'dash', 'ksh'].includes(name)) {
      const flag = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a))
      if (flag !== -1 && args[flag + 1] != null) nested.push(...parseCommands(args[flag + 1], depth + 1))
    } else if (name === 'eval') {
      nested.push(...parseCommands(args.join(' '), depth + 1))
    }
  }
  return [...commands, ...nested]
}

// Programs that run another program: skip them (and their own flags) to find
// the one that matters.
const WRAPPERS = new Set(['sudo', 'env', 'command', 'exec', 'time', 'nohup', 'nice', 'xargs', 'npx', 'bunx', 'caffeinate'])
const RUNNER_PAIRS = [['pnpm', 'dlx'], ['yarn', 'dlx'], ['npm', 'exec'], ['pnpm', 'exec'], ['bun', 'x']]

/** The program that runs (basename, no @version) and its arguments. */
export function normalise(words) {
  let rest = [...words]
  for (let guard = 0; guard < 20 && rest.length; guard += 1) {
    const first = rest[0]
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) {
      rest = rest.slice(1)
      continue
    }
    const base = first.split('/').at(-1)
    if (WRAPPERS.has(base)) {
      rest = rest.slice(1)
      // Drop the wrapper's own options (and sudo -u USER style values).
      while (rest.length && (rest[0].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(rest[0]))) {
        const takesValue = /^-(u|g|p|n|I|L|C|P|package)$/.test(rest[0]) || rest[0] === '--package'
        rest = rest.slice(takesValue ? 2 : 1)
        if (rest[0] === '--') rest = rest.slice(1)
      }
      continue
    }
    const pair = RUNNER_PAIRS.find(([a, b]) => base === a && rest[1] === b)
    if (pair) {
      rest = rest.slice(2)
      while (rest.length && rest[0].startsWith('-')) rest = rest.slice(1)
      continue
    }
    break
  }
  const name = (rest[0] ?? '').split('/').at(-1).replace(/@[^/]*$/, '')
  return { name, args: rest.slice(1) }
}

#!/usr/bin/env node
// PreToolUse guard: nothing leaves this machine without the human's "go".
//
// Wired in .claude/settings.json for Bash and for every MCP tool. It blocks:
//   - git push, however it is invoked (sh -c, eval, $(…), a full path);
//   - any Supabase CLI command not on the local-only list, and any that names
//     --linked, --db-url or --project-ref;
//   - any Vercel CLI command other than local dev/build and read-only listing;
//   - psql / pg_dump / pg_restore aimed at a host that is not this machine;
//   - anything naming the production or deprecated project, a *.supabase.co or
//     pooler host, the Vercel API, or the env vars that hold production's
//     address (so `curl "$VITE_SUPABASE_URL/…"` is caught too);
//   - on a Supabase or Vercel MCP server, every tool except a short read-only
//     list: an allowlist, so a tool added later is blocked until reviewed.
//
// When the human says "go", Claude hands over the exact commands (the
// approval-packet and deploy-order skills) and the human runs them in their own
// terminal. There is no bypass Claude can set for itself, and guard-migrations
// stops Claude editing this file or .claude/settings.json.
//
// Exit 2 blocks the call and shows stderr to Claude. Unreadable input blocks.

import { readFileSync } from 'node:fs'
import { parseCommands, normalise } from './lib/shell.mjs'

function block(message) {
  process.stderr.write(`guard-remote: ${message} Ask the human to run it themselves after their "go".\n`)
  process.exit(2)
}

let input
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  block('could not read the hook input; refusing to guess.')
}

const tool = String(input.tool_name ?? '')
const args = input.tool_input ?? {}

// --- MCP tools -------------------------------------------------------------
// Claude.ai connectors are named by id, not by product, so a server counts as
// Supabase or Vercel by its name, its known id, or a tool only that product has.
const SUPABASE_IDS = ['bc386342-62f9-4235-8afa-9d60dd7d9ee9']
const VERCEL_IDS = ['fc1a17ec-07c5-4849-be48-9e0ae07755a3']
const SUPABASE_ONLY = new Set([
  'execute_sql', 'apply_migration', 'list_tables', 'list_migrations', 'list_extensions',
  'get_advisors', 'generate_typescript_types', 'deploy_edge_function', 'list_edge_functions',
  'get_edge_function', 'get_publishable_keys', 'get_project_url', 'query_logs', 'confirm_cost',
  'merge_branch', 'reset_branch', 'rebase_branch', 'restore_project', 'search_docs',
])
const VERCEL_ONLY = new Set([
  'create_deployment', 'list_deployments', 'get_deployment', 'request_promote', 'request_rollback',
  'edit_project_env', 'create_project_env', 'get_runtime_logs', 'search_vercel_documentation',
])
// What may run on those servers: documentation, and metadata that says nothing
// about the database's contents or the deployment's secrets.
const SUPABASE_READ = new Set([
  'search_docs', 'list_projects', 'get_project', 'list_organizations', 'get_organization', 'get_cost',
])
const VERCEL_READ = /^(get|list|search|count|aggregate|read)_/
const VERCEL_SECRETISH = /env|token|secret|bypass|key|sso|oidc/

if (tool.startsWith('mcp__')) {
  const parts = tool.split('__')
  const server = parts.slice(1, -1).join('__').toLowerCase()
  const action = parts.at(-1)
  const isSupabase = /supabase/.test(server) || SUPABASE_IDS.includes(server) || SUPABASE_ONLY.has(action)
  const isVercel = /vercel/.test(server) || VERCEL_IDS.includes(server) || VERCEL_ONLY.has(action)
  if (isSupabase && !SUPABASE_READ.has(action)) block(`${action} on a Supabase server can reach the database or project.`)
  if (isVercel && (!VERCEL_READ.test(action) || VERCEL_SECRETISH.test(action))) {
    block(`${action} on a Vercel server can change the project or read its secrets.`)
  }
  process.exit(0)
}

if (tool !== 'Bash') process.exit(0)
const cmd = String(args.command ?? '')

// --- Whole-string checks: names that are never needed locally ---------------
if (/czvejcytunugftbspxmr|ydbhuynqjymfkqllijzc/.test(cmd)) block('that names a remote Supabase project.')
if (/[\w-]+\.supabase\.co\b|pooler\.supabase\.com|api\.supabase\.com/.test(cmd)) block('that addresses a remote Supabase host.')
if (/api\.vercel\.com/.test(cmd)) block('that calls the Vercel API.')
if (/\$\{?(VITE_)?SUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL)\b|\$\{?DATABASE_URL\b/.test(cmd)) {
  block('that reads the production Supabase address or keys from the environment.')
}
if (/--env-file[= ]\S*\.env(?!\.example)\b/.test(cmd)) block('that loads the real .env files (production values) into a process.')

// --- Per-command checks ----------------------------------------------------
const SUPABASE_LOCAL = [
  /^(start|stop|status|init|help|--version|-v)\b/,
  /^db\s+(start|reset|diff|lint)\b/,
  /^test\s+db\b/,
  /^migration\s+new\b/,
  /^migration\s+list\b.*--local\b/,
  /^gen\s+types\b.*--local\b/,
  /^inspect\s+db\b.*--local\b/,
  /^functions\s+(new|serve)\b/,
]
const VERCEL_LOCAL = [/^(dev|build|ls|list|logs|inspect|whoami|help|--version|-v)\b/, /^env\s+(ls|list)\b/]
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|::1|\[::1\]|\/.*)$/

// Just asking for help runs nothing: `supabase db push --help`.
const helpOnly = (rest) => /^([a-z][\w-]*\s+){0,3}(--help|-h)$/.test(rest)

// git's own options that take a value, so the subcommand can be found after them.
const GIT_VALUE_OPTS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env'])
function gitSubcommand(gitArgs) {
  for (let i = 0; i < gitArgs.length; i += 1) {
    const a = gitArgs[i]
    if (GIT_VALUE_OPTS.has(a)) i += 1
    else if (!a.startsWith('-')) return a
  }
  return null
}

function hostsOf(pgArgs) {
  const hosts = []
  pgArgs.forEach((a, i) => {
    if (a === '-h' || a === '--host') hosts.push(pgArgs[i + 1] ?? '')
    else if (a.startsWith('--host=')) hosts.push(a.slice(7))
    else if (/^-h./.test(a)) hosts.push(a.slice(2))
    const url = /^postgres(?:ql)?:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^:/?]+)/.exec(a)
    if (url) hosts.push(url[1])
    const kv = /(?:^|\s)host=([^\s]+)/.exec(a)
    if (kv) hosts.push(kv[1])
  })
  return hosts
}

for (const command of parseCommands(cmd)) {
  const { name, args: rest } = normalise(command.words)
  const line = rest.join(' ')

  if (name === 'git' && gitSubcommand(rest) === 'push') block("git push is the human's call.")

  if (name === 'supabase') {
    if (/--linked\b|--db-url\b|--project-ref\b/.test(line)) block('that Supabase command targets a remote project.')
    if (helpOnly(line)) continue
    if (!SUPABASE_LOCAL.some((re) => re.test(line))) {
      block(`"supabase ${rest.slice(0, 2).join(' ')}" is not on the local-only list.`)
    }
  }

  if (name === 'vercel') {
    if (helpOnly(line)) continue
    if (!VERCEL_LOCAL.some((re) => re.test(line))) {
      block(`"vercel ${rest.slice(0, 2).join(' ') || '(bare, which deploys)'}" can deploy or change the project.`)
    }
  }

  if (['psql', 'pg_dump', 'pg_dumpall', 'pg_restore', 'pgcli'].includes(name)) {
    const remote = hostsOf(rest).find((h) => !LOCAL_HOST.test(h))
    if (remote !== undefined) block(`${name} is aimed at ${remote || 'an unnamed host'}, not the local stack.`)
  }
}

process.exit(0)

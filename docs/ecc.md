# ECC in this repository

ECC ("Everything Claude Code", plugin `ecc@ecc` v2.2.2) is installed for the
user from the official source, `https://github.com/affaan-m/ECC` (owner
`affaan-m`, not a fork; installed commit `e482e57`, 2026-09-25). MIT licence.

It ships 68 agents, 292 skills, 94 commands, 24 hooks and one MCP server
(`chrome-devtools`, 30 tools). Loaded, that was about 16k tokens in every
session here: 6.1k of agent descriptions and 9.6k of skill and command
listings, plus the MCP server's 30 deferred tools. Claude Code has no
per-skill or per-agent switch for plugin content (`skillOverrides` ignores
plugin skills), so it is all or nothing per project.

## Decision (2026-09-28)

**Disabled for this project** in `.claude/settings.json`:

```json
"enabledPlugins": { "ecc@ecc": false }
```

That removes every ECC agent, skill, command, hook and the chrome-devtools
MCP server from sessions opened in this repo. Other projects are unaffected
(the user-level setting still enables ECC).

**Kept, as Mindful-specific adaptations** (copied and rewritten, credited in
each file; Mindful's `CLAUDE.md`, `SECURITY.md` and lanes override them):

| Mindful piece | Adapted from ECC |
|---|---|
| `.claude/agents/explorer.md` (haiku) | `agents/code-explorer.md` |
| `.claude/agents/planner.md` (opus) | `agents/planner.md` |
| `.claude/agents/reviewer.md` (sonnet) | `agents/code-reviewer.md` (confidence gate, proof for HIGH) |
| `.claude/agents/gated-reviewer.md` (opus) | `agents/security-reviewer.md` + `agents/database-reviewer.md` |
| `.claude/skills/migration-checklist` | `skills/database-migrations` |

Everything else in ECC is disabled here, including its code-review,
verification-loop, git-workflow, deployment-patterns and security-review
skills. Mindful's own `task-workflow`, `approval-packet`, `deploy-order` and
`npm run verify` cover those jobs.

## Hooks

ECC's 24 hooks were already no-ops before this change: the user's
`~/.claude/settings.json` sets `pluginConfigs["ecc@ecc"].options.hooks_enabled`
to `false`, and every ECC hook entry point checks it (`scripts/lib/hook-flags.js`).
With the plugin disabled here they no longer load at all.

They cannot conflict with Mindful's guards even if re-enabled. Claude Code runs
every matching PreToolUse hook, and any one exiting 2 blocks the call, so an
ECC hook can add a block but never lift one of ours. Keep `hooks_enabled:
false` anyway. Its `config-protection`, `gateguard-fact-force` and
`stop-format-typecheck` hooks would add friction (and tokens) to ordinary
edits here.

## Re-enabling

- **All of ECC in this repo:** set `"ecc@ecc": true` in `.claude/settings.json`
  (or delete the line), then start a new session.
- **One agent or skill:** copy it from
  `~/.claude/plugins/cache/ecc/ecc/2.2.2/agents/<name>.md` or
  `.../skills/<name>/` into `.claude/agents/` or `.claude/skills/`, and trim it
  for Mindful. Only that one piece costs tokens.
- **Its browser MCP only:** add `chrome-devtools` (`npx -y chrome-devtools-mcp@latest`)
  to a project `.mcp.json`. The desktop app's built-in browser usually covers this.

---
name: task-workflow
description: The default loop for any Mindful task — scope, plan, build, verify, review, commit locally. Use at the start of every non-trivial task.
---

# Task workflow

Rules come from `AGENTS.md`; this is the order to apply them in. Spend tokens
on the change, not on reading: let subagents read, and read excerpts yourself.

## 1. Scope — is it ordinary or gated?

**Gated** if it touches any of: `supabase/` (migrations, tests, SECURITY.md),
`api/`, `vercel.json`, `src/config/env.js`, `src/backend/auth/`, consent or
sharing, `scripts/check-*.mjs`. Everything else is **ordinary**.

The guard files (`.Codex/settings.json`, `scripts/hooks/`,
`scripts/lint-baseline.json`) are the human's. Propose a change; don't make it.

Unfamiliar code? Send **explorer** (haiku) with one precise question. Don't
open ten files to find one.

## 2. Plan — only when it earns it

Use **planner** (opus) if the task is gated, adds a migration, or spans more
than ~3 files. Otherwise a three-line plan in your head is enough.

## 3. Build

- Smallest diff that does the job; match the surrounding code.
- Migrations: follow the **migration-checklist** skill.
- Change coupled files together (AGENT_RULES.md § 3).

## 4. Verify

```bash
npm run verify
```

Green prints one line. Red prints only what failed. Fix and re-run. Never
raise `scripts/lint-baseline.json`; it only goes down.

## 5. Review

- Ordinary → **reviewer** (sonnet).
- Gated → **gated-reviewer** (opus). Must say SAFE TO PACKET before step 7.

Fix real findings, re-verify. Don't argue with a finding you can't disprove.

## 6. Commit locally

At the end of the task, commit on the current branch with a plain message
saying what changed and why. **Never push.** Update `SESSION_NOTES.md` when
the project's state changed (new migration, new env var, new trap).

## 7. Anything that leaves this machine

Pushing, migrating production, setting Vercel env vars: prepare an
**approval-packet** (which uses **deploy-order**), hand it over, and stop. The
human runs the commands after their "go". The guards in `.Codex/settings.json`
block these commands for Codex anyway.

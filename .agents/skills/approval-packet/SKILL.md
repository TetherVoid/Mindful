---
name: approval-packet
description: Writes the one page the human reads before saying "go" to a push, a production migration, or a Vercel env change. Use after gated-reviewer says SAFE TO PACKET.
---

# Approval packet

The human decides from this page alone, so it must be complete, short and
honest. Plain words; no selling. Under ~50 lines.

Don't write one until:
- `npm run verify` is green, and
- for gated work, **gated-reviewer** returned SAFE TO PACKET, and
- the work is committed locally.

## Template

```markdown
# Approval: <what, in five words>

**Asking for:** push `main` (<n> commits) · migrate production · set env var
**Commits:** <short sha> <subject> (one line each)

## What changes for people
- Students: … / Teachers: … / Admins: … / Anonymous: nothing
- Who can see what, before → after. "No change to access" if so.

## Proof
- npm run verify: <the summary line, pasted>
- supabase test db --local: <n>/<n> (if a migration)
- gated-reviewer: SAFE TO PACKET — <one line on what it tried>

## Risks
- <concrete risk> → <what limits it> (max 4; "none known" is allowed)

## Commands, in order  (from the deploy-order skill)
1. …

## Check afterwards
- <the query or URL that proves it worked>

## If it goes wrong
- <rollback: backup restore, revert commit + push, or env var removal>
```

Then stop and wait. A "go" covers exactly the commands in the packet, once.
Anything new needs a new packet.

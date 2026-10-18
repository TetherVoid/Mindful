---
name: deploy-order
description: Decides and writes the exact order of production steps for Mindful — backup, migration, env vars, push, live check. Use when writing an approval packet.
---

# Deploy order

Codex writes these steps; **the human runs them** in their own terminal after
their "go". The guards block them for Codex.

Facts that fix the order:
- Pushing `main` deploys production: Vercel builds every push.
- Production database: Supabase **Mumbai, `czvejcytunugftbspxmr`**. Seoul
  (`ydbhuynqjymfkqllijzc`) is deprecated: never link or migrate it.
- `supabase db push` applies each migration in its own transaction, in name
  order. There are no down migrations; rollback means restoring a backup.

## Pick the order

| The change | Order |
|---|---|
| Migration adds something new code needs (column, function, policy) | migration → push |
| Code stops using something a migration removes or restricts | push → wait for the deploy → migration |
| Migration is additive and old code ignores it | migration → push |
| New server env var (`api/`) | set in Vercel → push (or redeploy) |
| Code only, no schema, no env | push |

If old code and new schema can't coexist in either order, split it into two
releases. Don't plan a moment where production is broken.

## Step blocks to copy into the packet

**Backup** (any migration once Mumbai holds real accounts; see
`supabase/MIGRATIONS.md`):
```bash
supabase link --project-ref czvejcytunugftbspxmr
supabase db dump --linked -f backup-schema.sql
supabase db dump --linked --data-only -f backup-data.sql
supabase db dump --linked --data-only --schema auth -f backup-auth-data.sql
```

**Migration:**
```bash
supabase migration list          # remote must match local up to the new file(s)
supabase db push --dry-run       # lists exactly the new file(s), nothing else
supabase db push
supabase migration list          # new file(s) now applied remotely
```

**Env var:** Vercel dashboard → Settings → Environment Variables, Production
only, marked sensitive. Never a `VITE_` name for a secret.

**Code:**
```bash
git push origin main
```

**Live check** (after the deploy finishes):
```bash
node scripts/check-deploy-config.mjs --live https://website-1wf9.vercel.app
```
Add the change's own check: the SQL from `supabase/MIGRATIONS.md` "Verifying
the result", or the page or endpoint that should now behave differently.

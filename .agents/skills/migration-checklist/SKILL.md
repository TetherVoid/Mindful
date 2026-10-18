---
name: migration-checklist
description: Steps and checks for writing a new Supabase migration and its pgTAP tests in Mindful. Use whenever a change needs a schema, policy, grant or function change.
---

# Migration checklist

Principles adapted from ECC's `database-migrations` skill (affaan-m/ECC, MIT).
Mindful's `supabase/SECURITY.md` overrides it on anything about access.

**Never edit a committed migration.** Production may already have it. The
`guard-migrations` hook blocks it anyway. A fix is a new file.

## Write it

1. `supabase migration new <what_it_does>`. The name must sort after every
   existing file (the hook checks).
2. Open with a comment block: what changes, **why**, and what stays the same.
   Match the style of `20260927000200_report_slot_eligibility.sql`.
3. For access changes, read the matching `supabase/SECURITY.md` section first.
   Then, in the SQL:
   - `alter table … enable row level security` on every new table (the
     `ensure_rls` trigger is a backstop, not the plan);
   - explicit grants, `revoke … from anon`. Nothing in `public` executable
     by `anon`;
   - `security definer` functions: `set search_path = public, pg_temp`, check
     `auth.uid()` and deactivation, fail closed;
   - teacher and admin reads still gated by `share_with_teachers`.
4. Schema changes and data backfills go in separate files. New columns are
   nullable or have a default.
5. If you change a CHECK length limit, change `src/shared/constants/limits.js`
   in the same commit.

## Test it

1. Add `supabase/tests/NNN_<topic>_test.sql`, numbered after the last one.
   Same shape as the others: `begin; … select plan(n); … finish(); rollback;`.
2. Test the refusals, not only the happy path. Cover each role, an
   anonymous caller, a deactivated account, and consent on and off.
3. Prove the test fails without the migration if you can. A test that
   passes either way proves nothing.
4. Run it on the local stack only:
   ```bash
   supabase db reset          # replays every migration from empty
   supabase test db --local
   npm run verify
   ```

## Record it

- If the access model changed, update `supabase/SECURITY.md` and the
  "Known state" part of `SESSION_NOTES.md`.
- Commit locally. Then **gated-reviewer** → **approval-packet** →
  **deploy-order**. The human applies it to production.

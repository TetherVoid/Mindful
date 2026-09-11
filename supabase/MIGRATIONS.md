# Migrations

How the database is changed, and how this particular upgrade reaches production.

## The files

```
supabase/migrations/
  20260911000100_baseline_production.sql    what production already had
  20260911000200_roles.sql                  roles, escalation barriers, signup
  20260911000300_classes.sql                classes, membership, enrolment
  20260911000400_teacher_reads.sql          the figures a teacher may read
  20260911000500_owner_policy_hardening.sql the four journal tables
  20260911000600_revoke_unused_table_privileges.sql  TRUNCATE/REFERENCES/TRIGGER
  20260911000700_self_service_deactivation.sql  deactivate_my_account()
  20260911000800_admin_user_directory.sql       admin_list_users()
supabase/tests/                             pgTAP, run with `supabase test db`
```

`supabase/schema.sql` is superseded and now says so. It was a single idempotent
script pasted into the SQL Editor by hand, which worked while the database was
empty and stopped working the moment it held real users — a script describing
the intended end state cannot describe how to get there from what a particular
database currently holds, and nothing recorded which parts of it a given
database had seen.

## Local

```bash
colima start                 # or Docker Desktop; the stack needs a container runtime
supabase start               # first run pulls several GB of images
supabase db reset            # replays every migration from empty
supabase test db             # runs supabase/tests/
```

`db reset` is the one that matters. It proves the migrations apply cleanly in
order from nothing, which is the same sequence production will receive.

## Production

Production has never had `schema.sql` applied and its migration history is
empty, but it *does* already hold every object in the baseline migration. So the
baseline must be **marked** as applied, not run.

This is not about the file erroring. Two earlier explanations here were wrong
and are corrected: `create event trigger` does **not** need superuser on hosted
Supabase (production shows `postgres` owning both `rls_auto_enable` and
`ensure_rls` without being one), and the trigger already existing would not stop
it either, because the baseline drops it `if exists` first, as it does with every
other object.

The reason is that 000100 is a *description* of production, and replaying a
description against a live database with real users is needless churn with a real
blast radius. It would drop and recreate the five owner policies, drop and
recreate the event trigger that guards DDL, and reinstate the old
`handle_new_user` — the version with no conflict handling and no exception block
— until 000200 replaces it again moments later. Each window is brief and
avoidable, and none of it buys anything, because production already holds the end
state the file describes.

Order matters below: `supabase login` and `supabase link` establish the
connection that every `--linked` command depends on, so nothing that talks to
the project can come before them.

```bash
# 1. Authenticate, then point the CLI at the project. Everything after this
#    depends on both.
supabase login
supabase link --project-ref <your-project-ref>

# 2. Back up. `db dump` defaults to SCHEMA ONLY, so a plain dump would give you
#    a perfect copy of the structure and none of the three users' journals.
#    Take all three of these.
supabase db dump --linked -f backup-schema.sql
supabase db dump --linked --data-only -f backup-data.sql

#    The default dump covers `public` and excludes Supabase's own schemas, so
#    the accounts themselves are NOT in either file above. Dump auth separately
#    or a restore would bring back the rows with no users to own them.
supabase db dump --linked --data-only --schema auth -f backup-auth-data.sql

#    These are a convenience, not the safety net. Take a real one first:
#    Dashboard -> Database -> Backups, or enable PITR.

# 3. Tell the remote history the baseline is already there. Not optional —
#    see above.
supabase migration repair --status applied 20260911000100

# 4. Check what is about to happen. Expect 000100 applied on both sides, and
#    these seven as remote-pending — every migration after the baseline:
#      20260911000200_roles
#      20260911000300_classes
#      20260911000400_teacher_reads
#      20260911000500_owner_policy_hardening
#      20260911000600_revoke_unused_table_privileges
#      20260911000700_self_service_deactivation
#      20260911000800_admin_user_directory
#    Anything else pending, or 000100 pending, means stop and re-read step 3.
supabase migration list

# 5. Apply.
supabase db push
```

### What changes for the three existing users

- Each gains `role = 'student'`, a null `display_name`, a null `deactivated_at`,
  and `share_with_teachers = false`. The `add column ... not null default` fills
  the rows; no UPDATE runs against them.
- Their UTM attribution, `created_at`, and every mood log, habit, habit log and
  thought record are untouched. No migration drops or recreates a table that
  holds data.
- An auth user with no `profiles` row — which production's old
  `handle_new_user` could produce, since it had no conflict handling and no
  exception block — gets one, as a student.
- `authenticated` loses table-wide UPDATE on `profiles` and gains it on seven
  named columns. This is the barrier that stops a user writing their own `role`.

### Promoting yourself to administrator

There is deliberately no way to become an administrator from inside the
application, and no user id is hard-coded in any migration. Run this once, by
hand, in the SQL Editor, with your own address:

```sql
begin; select set_config('mindful.privileged_write','on',true); update public.profiles set role='admin' where id=(select id from auth.users where email='you@example.com'); commit;
```

The `set_config` is not optional. `guard_profile_privileges` is a BEFORE UPDATE
trigger that raises `42501` on any change to `role`, and it fires for superusers
too; the setting is how the sanctioned paths announce themselves.

Setting it is not in itself a privilege — `set_config()` is executable by
PUBLIC, so anyone can turn the flag on for their own session. What the guard
actually checks is **who is asking**: it honours the flag only when
`current_user` is not `authenticated` or `anon`. In the SQL Editor you are
`postgres`, so it is honoured. In a browser session you are `authenticated`, so
it is ignored and the update is refused. Inside `set_user_role()` and
`set_account_active()` — SECURITY DEFINER, owned by `postgres` — `current_user`
is the owner, which is why those keep working.

After that, every further promotion goes through `set_user_role()` and lands in
`role_change_audit`. To find the uuid to promote, an existing administrator can
call `admin_list_users(search, page_limit, page_offset)` — the only place in the
schema that returns another person's email address, administrator-only, capped
at 100 rows a page.

### Closing an account without deleting it

`deactivate_my_account()` lets a user switch their own account off. It takes no
arguments, so there is nowhere to name somebody else, and it only ever *sets*
`deactivated_at` — it is not a toggle. Reactivation stays with
`set_account_active()`, which is administrator-only, and a deactivated account
fails `is_admin()` whatever its role, so a suspended administrator cannot lift
their own suspension either.

A deactivated account keeps every row it wrote and loses access to all of them:
the four owner policies carry `not is_deactivated()`. Its class memberships are
cleared so it stops appearing on rosters.

## Rolling back

There is no down migration. Reversing this upgrade means restoring the backups
from step 2 — which is why step 2 comes before step 5.

A partial failure does not need a rollback: `db push` runs each migration in its
own transaction, so a migration that fails leaves the database as it was before
that file, and the history records which ones succeeded. Fix the file and push
again.

## `rls_auto_enable`

Production's `ensure_rls` event trigger and the `public.rls_auto_enable()`
function behind it are now reproduced verbatim at the top of the baseline
migration, so local runs and the test suite exercise the migrations under the
same DDL rules production applies.

It turns row-level security on for any table created in `public`. The migrations
also enable RLS explicitly on every table they create; the two agree, and
`enable row level security` is idempotent. Its `search_path` is pinned to
`pg_catalog`, so nothing in `public` can shadow `format()` or
`pg_event_trigger_ddl_commands()`.

`postgres` owns both it and the function on hosted Supabase without being a
superuser, so nothing about it is privileged beyond the usual. It is reproduced
here so the local database and the test suite run under the same DDL rules
production applies.

# Migrations

How the database is changed, and how this particular upgrade reaches production.

## Which project is production

There are two Supabase projects. Only one of them is production.

| | project | ref | region | status |
|---|---|---|---|---|
| **Production** | Mindful | `czvejcytunugftbspxmr` | Mumbai, `ap-south-1` | **the live project** |
| Deprecated | TetherVoid's Project | `ydbhuynqjymfkqllijzc` | Seoul | frozen backup — do not touch |

**Mumbai (`czvejcytunugftbspxmr`) is production.** It was created through the
Vercel Marketplace integration and is linked to the Vercel project and to the
GitHub repository. Every `--linked` command in this file means this project.

**Seoul (`ydbhuynqjymfkqllijzc`) is deprecated.** It is what the site ran on
before, it holds three test accounts that are deliberately **not** being
migrated, and the account that owns this repository cannot administer it. It is
kept as a backup and nothing else: do not link to it, do not run a migration
against it, do not change it. If a command or an environment variable still
names that ref, that is the bug.

Nothing about the two is interchangeable. A Vercel deployment whose
`VITE_SUPABASE_URL` names one project and whose `SUPABASE_URL` names the other
is a deployment where the browser signs in against one database and
`/api/report` and `/api/account` verify the caller against the other;
`supabaseRestConfig()` in `api/_lib/auth.js` refuses to run rather than guess,
but the real fix is that both must name Mumbai.

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
  20260925000100_consent_scoped_reads.sql       consent gates admins too; no habit
                                                names or times of day in teacher reads
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

Mumbai is a **fresh, empty project**. That changes the procedure, and it is
worth being explicit about what changed and why, because the previous version of
this section said the opposite.

**The `migration repair` step is gone. Do not run it.** It existed for the old
Seoul project, which already held every object the baseline describes and had
real users sitting on top of them — replaying a *description* of a live database
against that database would have dropped and recreated five owner policies and
the DDL event trigger, and reinstated the old `handle_new_user`, for no gain.
None of that reasoning applies to an empty database. On Mumbai there is nothing
to preserve and nothing to churn, so `20260911000100_baseline_production.sql` is
**run**, like any other migration, and all eight apply in order from nothing.
That is the same sequence `supabase db reset` exercises locally, which is what
makes the local run evidence about this one.

Marking the baseline applied on an empty project would be actively wrong: the
five tables, the `user_role` enum and the `ensure_rls` event trigger would never
be created, and 000200 would fail on the first table it altered.

```bash
# 1. Authenticate, then point the CLI at Mumbai. Everything after this depends
#    on both.
supabase login
supabase link --project-ref czvejcytunugftbspxmr

# 2. Confirm it really is empty before writing to it. Expect: no remote
#    migrations, and no tables in `public`.
supabase migration list
supabase db dump --linked -f /tmp/mumbai-before.sql

#    If either shows tables, policies or auth users, STOP. Something else has
#    been applied to this project and the assumption behind this procedure is
#    no longer true.

# 3. Apply all eight. No repair step.
supabase db push

# 4. Confirm. Expect all eight listed as applied both locally and remotely.
supabase migration list
```

### Verifying the result

After the push, the project should hold:

- **Tables** (`public`): `profiles`, `mood_logs`, `habits`, `habit_logs`,
  `thought_records`, `classes`, `class_teachers`, `class_members`,
  `role_change_audit` — with **RLS enabled on every one of them**.
- **`profiles.role`**, a `user_role` enum (`student` | `teacher` | `admin`)
  defaulting to `student`, alongside `display_name`, `share_with_teachers`
  (default **false**) and `deactivated_at`.
- **Functions**, including `my_profile()`, `is_admin()`, `is_deactivated()`,
  `may_view_student()`, `set_user_role()`, `set_account_active()`,
  `create_class()`, `join_class()`, `leave_class()`, `rotate_join_code()`,
  `class_roster()`, `class_overview()`, `student_overview()`,
  `student_mood_series()`, `student_habit_summary()`, and the two this upgrade
  added: **`deactivate_my_account()`** and **`admin_list_users()`**.
- **The `ensure_rls` event trigger** and `public.rls_auto_enable()` behind it.
- **No function in `public` executable by `anon`** — 000800 ends with a `do`
  block that raises rather than completing if any is.

A one-query version of the same check, for the SQL Editor:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' order by proname;
select evtname from pg_event_trigger;
select count(*) as anon_callable from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE');
```

`rowsecurity` must be `true` on every row of the first, `ensure_rls` must appear
in the third, and `anon_callable` must be `0`.

### Backups, for every change after this one

This push needs no backup — the project is empty, so there is nothing to lose.
Every later change to Mumbai does, once it holds real accounts.

```bash
# `db dump` defaults to SCHEMA ONLY. A plain dump gives you a perfect copy of
# the structure and none of the journals. Take all three.
supabase db dump --linked -f backup-schema.sql
supabase db dump --linked --data-only -f backup-data.sql
supabase db dump --linked --data-only --schema auth -f backup-auth-data.sql
```

These are a convenience, not the safety net. Dashboard -> Database -> Backups,
or PITR, is the safety net.

### What the Seoul project's three users would have needed

Kept for the record only. **They are not being migrated** — they are test
accounts, and Mumbai starts empty. This is what the upgrade would have done to
them, and it is still what will happen to any account that exists on Mumbai when
a future migration of this shape runs.

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

There is no down migration.

For **this** push there is nothing to roll back to, and nothing that needs it:
Mumbai was empty beforehand, so the worst case is an empty project again.

For any **later** change, reversing it means restoring the backups above — which
is why taking them comes before applying anything.

Either way, a partial failure does not need a rollback. `db push` runs each
migration in its own transaction, so one that fails leaves the database exactly
as it was before that file, and the remote history records which ones succeeded.
Fix the file and push again.

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

-- Upgrade 1 of 4: roles.
--
-- Adds the `user_role` enum, four columns to `profiles`, the role-change audit
-- trail, and the three barriers that stop a user promoting themselves. Nothing
-- here drops or recreates `profiles`; every change to it is an ALTER, and the
-- existing rows (and their UTM attribution) are untouched.
--
-- Runs against a database that already holds real users. The two statements
-- that touch data are the backfill near the end, and both are idempotent.

-- ---------------------------------------------------------------------------
-- 1. The enum
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.user_role as enum ('student', 'teacher', 'admin');
exception
  when duplicate_object then null;
end
$$;


-- ---------------------------------------------------------------------------
-- 2. Columns on the existing profiles table
--
-- `role` is the authorisation fact for the whole application. It is never
-- writable by the user it describes — see § 5. `deactivated_at` is likewise
-- administrative, not personal.
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists role public.user_role not null default 'student';
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists deactivated_at timestamptz;

-- Teacher visibility is opt-in: a student shares nothing with their teachers
-- until they say so. `add column if not exists` does not revisit the default on
-- a database where the column already exists, so the default is also set
-- explicitly — otherwise a re-run would leave an earlier `default true` in
-- place and every new account would be sharing.
alter table public.profiles add column if not exists share_with_teachers boolean not null default false;
alter table public.profiles alter column share_with_teachers set default false;

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles add constraint profiles_display_name_length
  check (display_name is null or char_length(display_name) <= 120);


-- ---------------------------------------------------------------------------
-- 3. The audit trail
--
-- Every role change, with who made it. A role change with no record of who made
-- it is not an authorisation system, it is a rumour.
-- ---------------------------------------------------------------------------

create table if not exists public.role_change_audit (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  previous_role public.user_role,
  new_role public.user_role not null,
  changed_by uuid,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists role_change_audit_target_idx
  on public.role_change_audit (target_user_id, created_at desc);

alter table public.role_change_audit enable row level security;
revoke all on table public.role_change_audit from anon;

-- Its policy is created in § 4, after is_admin(): PostgreSQL resolves a policy
-- expression when the policy is created, so the function has to exist first.


-- ---------------------------------------------------------------------------
-- 4. Helper functions
--
-- These are SECURITY DEFINER for one specific reason: a policy on `profiles`
-- that reads `profiles` to decide who may read `profiles` is infinitely
-- recursive, and Postgres will say so at query time. A definer function runs as
-- the table owner, which is not subject to RLS, so the recursion is cut.
--
-- That makes them the most dangerous objects in this migration, so each one:
--   * pins `search_path`, so a caller cannot shadow `profiles` with their own
--     table and answer its own authorisation question,
--   * takes its subject from `auth.uid()` rather than from an argument wherever
--     the answer is about the caller,
--   * is revoked from PUBLIC and anon, and granted only to `authenticated`.
--
-- anon gets none of them. There is no signed-out question worth asking here,
-- and a function that reports whether a given uuid is a teacher is not
-- something to hand to an unauthenticated caller.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    'student'::public.user_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.deactivated_at is null
  );
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('teacher', 'admin')
      and p.deactivated_at is null
  );
$$;

-- Deactivation has to be answerable without a profiles row: an account whose
-- signup trigger failed has none, and locking that person out of their own
-- journal would be the wrong failure. No row means not deactivated.
create or replace function public.is_deactivated()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.deactivated_at is not null
  );
$$;

-- Whether some OTHER user holds a teaching role. Needed because the
-- class_teachers insert policy in the next migration has to check the person
-- being added, and a teacher has no SELECT policy on anybody else's profiles
-- row — an inline EXISTS would quietly evaluate to false and the insert would
-- fail for the wrong reason.
create or replace function public.user_has_teacher_role(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.role in ('teacher', 'admin')
      and p.deactivated_at is null
  );
$$;

revoke execute on function
  public.current_user_role(),
  public.is_admin(),
  public.is_teacher(),
  public.is_deactivated(),
  public.user_has_teacher_role(uuid)
from public, anon;

grant execute on function
  public.current_user_role(),
  public.is_admin(),
  public.is_teacher(),
  public.is_deactivated(),
  public.user_has_teacher_role(uuid)
to authenticated;


-- Deferred from § 3: readable by administrators and by the person the entry is
-- about. Nothing writes to it except set_user_role() below, which runs as the
-- table owner.
drop policy if exists "role_change_audit: read" on public.role_change_audit;
create policy "role_change_audit: read" on public.role_change_audit
  for select using (target_user_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------------
-- 5. Role escalation: three independent barriers
--
-- This is the one thing in the schema that must not fail, so it does not rest
-- on a single mechanism.
--
--   1. Column privileges. `authenticated` has no UPDATE privilege on
--      profiles.role at all, so an UPDATE naming it is rejected by the grant
--      system before any policy is consulted. This is the barrier that holds
--      even if a policy is later widened by mistake.
--   2. A BEFORE UPDATE trigger that rejects a change to role or deactivated_at
--      unless it arrives through the definer functions below.
--   3. set_user_role(), the only sanctioned path: administrator-only, refuses
--      self-changes, refuses to remove the last administrator, and writes to
--      role_change_audit.
--
-- PostgreSQL cannot subtract a column from a table-level grant, so the
-- table-level UPDATE is revoked first and the permitted columns granted back.
-- Production's `authenticated` currently holds UPDATE on all of profiles via
-- Supabase's default grants; after this it holds it on seven named columns.
-- ---------------------------------------------------------------------------

revoke update on public.profiles from anon, authenticated;
grant update (
  display_name,
  share_with_teachers,
  first_utm_source,
  first_utm_medium,
  first_utm_campaign,
  first_utm_term,
  first_utm_content
) on public.profiles to authenticated;

-- `mindful.privileged_write` is set by the definer functions below for the
-- duration of their transaction.
--
-- An earlier version of this comment claimed a client could not set that GUC.
-- That was wrong: `set_config()` is executable by PUBLIC, so any session —
-- including a signed-in browser going through PostgREST — can turn the flag on
-- for itself. A flag that the attacker can set is not a barrier.
--
-- What makes it one is WHO is asking. The guard honours the flag only when
-- `current_user` is not a client role. Inside a SECURITY DEFINER function,
-- `current_user` is the function's owner (postgres), not the caller — so
-- set_user_role() and set_account_active() are believed, while the same flag set
-- by hand in a browser session, where `current_user` is `authenticated`, is
-- ignored. `session_user` would be the wrong test: it stays `authenticated`
-- inside the definer functions and would lock them out.
--
-- Anything else changing role or deactivated_at is a bug or an attack, and
-- either way it should fail loudly.
-- SECURITY INVOKER, deliberately, and this is the whole mechanism.
--
-- A trigger function needs no elevated rights here — it reads NEW and OLD and
-- raises, and touches no table. Making it DEFINER would be worse than
-- unnecessary: inside a DEFINER function `current_user` is always the owner, so
-- the check below could never see `authenticated` and the guard would wave
-- through exactly the attack it exists to stop. (It did, until a test caught
-- it.) As INVOKER, `current_user` is whatever the calling context is running as:
-- `authenticated` for a client UPDATE, and `postgres` when the call arrives from
-- inside set_user_role() or set_account_active(), which ARE definer functions
-- owned by postgres.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- The flag is only trusted from a role a client cannot be running as.
  if current_user not in ('authenticated', 'anon')
     and current_setting('mindful.privileged_write', true) = 'on' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'role may only be changed by an administrator through set_user_role()'
      using errcode = '42501';
  end if;

  if new.deactivated_at is distinct from old.deactivated_at then
    raise exception 'deactivated_at may only be changed through set_account_active()'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'profile identity is immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

create or replace function public.set_user_role(
  p_user_id uuid,
  p_role public.user_role,
  p_reason text default null
)
returns public.user_role
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous public.user_role;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may change a role' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'an administrator may not change their own role' using errcode = '42501';
  end if;

  select p.role into previous from public.profiles p where p.id = p_user_id for update;
  if not found then
    raise exception 'no such user' using errcode = 'P0002';
  end if;

  -- Demoting the last administrator would leave the deployment with no way back
  -- in short of the service-role key.
  if previous = 'admin' and p_role <> 'admin' then
    if (select count(*) from public.profiles p
        where p.role = 'admin' and p.deactivated_at is null) <= 1 then
      raise exception 'cannot remove the last administrator' using errcode = '42501';
    end if;
  end if;

  perform set_config('mindful.privileged_write', 'on', true);
  update public.profiles set role = p_role where id = p_user_id;
  perform set_config('mindful.privileged_write', 'off', true);

  insert into public.role_change_audit (target_user_id, previous_role, new_role, changed_by, reason)
  values (p_user_id, previous, p_role, auth.uid(), left(p_reason, 500));

  return p_role;
end;
$$;

revoke execute on function public.set_user_role(uuid, public.user_role, text)
  from public, anon;
grant execute on function public.set_user_role(uuid, public.user_role, text)
  to authenticated;

-- set_account_active() lives in the next migration: it clears the suspended
-- account's class memberships, and those tables do not exist yet.


-- ---------------------------------------------------------------------------
-- 6. Signup
--
-- Replaces production's handle_new_user. Two things this version must never do:
--
--   * take `role` from raw_user_meta_data. That column is whatever the browser
--     passed to signUp({ options: { data } }) — entirely caller-controlled. A
--     single `new.raw_user_meta_data->>'role'` here would make every account an
--     administrator on request. The role is hard-coded to 'student'; the only
--     way out of it is set_user_role().
--   * raise. It runs inside the auth.users insert, so an exception fails the
--     signup itself. Production's version can: it has no conflict handling and
--     no exception block, so a duplicate id or an over-length value would lose
--     the account. UTM capture is not worth that.
--
-- `search_path` gains pg_temp, which production's version omits — without it a
-- caller able to create a temp table could shadow `profiles`.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id, role, display_name,
    first_utm_source, first_utm_medium, first_utm_campaign, first_utm_term, first_utm_content
  )
  values (
    new.id,
    'student',
    left(nullif(coalesce(meta->>'full_name', meta->>'name'), ''), 120),
    left(meta->>'utm_source', 200),
    left(meta->>'utm_medium', 200),
    left(meta->>'utm_campaign', 200),
    left(meta->>'utm_term', 200),
    left(meta->>'utm_content', 200)
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

-- The trigger itself is unchanged from the baseline; recreated so this
-- migration is self-contained if the baseline was repaired rather than run.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Neither trigger function should be callable by anybody. Both return `trigger`,
-- so PostgREST will not expose them and Postgres refuses a direct call anyway —
-- but Supabase's default grants hand EXECUTE to anon and authenticated, and
-- leaving that in place means an audit of "what can anon run" has two entries to
-- reason about instead of none.
--
-- Revoking after the triggers exist is safe: PostgreSQL checks EXECUTE when a
-- trigger is created, not each time it fires.
revoke execute on function
  public.handle_new_user(),
  public.guard_profile_privileges()
from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 7. Profiles policies
--
-- Production has one policy, "profiles: owner full access", FOR ALL. It is
-- replaced by an explicit read and an explicit update.
--
-- Losing the FOR ALL policy also loses the owner's INSERT and DELETE on their
-- own profile row. Both are intended: the row is created by the signup trigger,
-- and it goes when the auth user goes, by cascade. No application code inserts
-- into profiles from the client — the only client write is the display name and
-- visibility update in backend/services/profile.js.
-- ---------------------------------------------------------------------------

drop policy if exists "profiles: owner full access" on public.profiles;

drop policy if exists "profiles: owner read" on public.profiles;
create policy "profiles: owner read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles: owner update" on public.profiles;
create policy "profiles: owner update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles: admin read" on public.profiles;
create policy "profiles: admin read" on public.profiles
  for select using (public.is_admin());


-- ---------------------------------------------------------------------------
-- 8. my_profile()
--
-- What the app reads on every boot. Goes through a function rather than a
-- select on `profiles` so there is one shape to maintain, and so a column added
-- to the table later is not exposed to the client by accident.
-- ---------------------------------------------------------------------------

create or replace function public.my_profile()
returns table (
  id uuid,
  role public.user_role,
  display_name text,
  share_with_teachers boolean,
  deactivated_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.role, p.display_name, p.share_with_teachers, p.deactivated_at, p.created_at
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;


-- ---------------------------------------------------------------------------
-- 9. Backfill
--
-- Two statements, both idempotent, both safe to re-run.
--
-- The first is the one the brief asked for: every existing profile gets
-- 'student'. The column default already does that for rows added after this
-- migration; this covers the three that were there before. It is written as a
-- no-op rather than skipped because `add column ... default` fills existing
-- rows in PostgreSQL 11+, so this is belt and braces and costs nothing.
--
-- The second is not in the brief and matters more. Production's
-- handle_new_user has no conflict handling and no exception block, so a signup
-- whose profile insert failed left an auth user with no profiles row. Such a
-- user would get `null` from my_profile(), which the client reads as "unknown
-- profile" — they would sign in and have no role at all. This inserts the
-- missing rows. If there are none, it does nothing.
--
-- Neither statement writes to an existing row's UTM values, created_at, or any
-- other column. `role` is the only column the first touches, and it only
-- touches rows where it is not already 'student'.
--
-- No user id is hard-coded here. Nobody is made an administrator by this
-- migration; see the promotion snippet in the handover notes.
-- ---------------------------------------------------------------------------

-- The ALTER in § 2 is the backfill. `add column ... not null default 'student'`
-- fills every pre-existing row in PostgreSQL 11+, so all three production
-- profiles hold 'student' the moment that statement returns. This block asserts
-- that rather than repeating it as an UPDATE.
--
-- An UPDATE here would be actively dangerous. `update profiles set role =
-- 'student'` is a no-op the first time and a demotion every time after, so a
-- re-run — or a restored database replayed through the migration history —
-- would strip the administrator this deployment depends on. The assertion has
-- the same evidentiary value and no failure mode.
do $$
declare
  missing integer;
begin
  select count(*) into missing from public.profiles where role is null;
  if missing > 0 then
    raise exception 'backfill failed: % profiles have no role', missing;
  end if;
end
$$;

-- This one is not in the brief and matters more.
--
-- Production's handle_new_user has no conflict handling and no exception block,
-- so a signup whose profile insert failed left an auth user with no profiles
-- row. Such a user gets null from my_profile(), which the client reads as
-- "unknown profile": they sign in and hold no role at all. This inserts the
-- missing rows as students. If there are none it does nothing.
--
-- It writes no existing row — `where not exists` plus `on conflict do nothing`
-- — so no UTM value, created_at or role already on file is touched. It does not
-- fire the guard trigger either, which is BEFORE UPDATE only.
--
-- No user id is hard-coded. Nobody is made an administrator by this migration;
-- the promotion snippet is in the handover notes and is run by hand.
insert into public.profiles (id, role, created_at)
select u.id, 'student', coalesce(u.created_at, now())
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

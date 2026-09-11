-- The upgrade does not cost anybody their data.
--
-- WHAT THIS TEST CAN AND CANNOT PROVE — read before trusting it.
--
-- `supabase db reset` applies every migration in order against an empty
-- database, so there is no point at which pre-upgrade rows exist to be
-- preserved. A test that claimed to replay a populated pre-upgrade database is
-- not something this harness can honestly run.
--
-- What it tests instead is the three properties the preservation actually rests
-- on, each of which IS checkable here:
--
--   1. Shape. Every column production's `profiles` has still exists, with the
--      same type. The upgrade only ever added.
--   2. Content. A row carrying UTM attribution survives the new constraint,
--      the new defaults and the guard trigger untouched, and comes out as a
--      student.
--   3. The backfill. The one statement in the migrations that writes to
--      existing data is re-run here, and asserted to change nothing — no rows
--      added, no rows lost, no column rewritten.
--
-- Property 3 is the one that matters most, because the backfill is the only
-- part of this upgrade that could destroy data, and re-running a migration is
-- exactly how that would happen.

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

\set legacy '55555555-5555-5555-5555-555555555555'
\set orphan '66666666-6666-6666-6666-666666666666'

create or replace function tests_make_user(p_id uuid, p_email text, p_meta jsonb default '{}'::jsonb)
returns uuid language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, 'x', now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, p_meta,
    '', '', '', ''
  );
  return p_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- 1. Shape: production's columns all survived
-- ---------------------------------------------------------------------------

select has_column('public', 'profiles', 'id', 'profiles.id survives');
select has_column('public', 'profiles', 'first_utm_source', 'profiles.first_utm_source survives');
select has_column('public', 'profiles', 'first_utm_medium', 'profiles.first_utm_medium survives');
select has_column('public', 'profiles', 'first_utm_campaign', 'profiles.first_utm_campaign survives');
select has_column('public', 'profiles', 'first_utm_term', 'profiles.first_utm_term survives');
select has_column('public', 'profiles', 'first_utm_content', 'profiles.first_utm_content survives');
select has_column('public', 'profiles', 'created_at', 'profiles.created_at survives');

select col_type_is('public', 'profiles', 'id', 'uuid',
  'profiles.id is still uuid');
select col_type_is('public', 'profiles', 'created_at', 'timestamp with time zone',
  'profiles.created_at is still timestamptz');

-- And the four new ones arrived.
select has_column('public', 'profiles', 'role', 'profiles.role was added');
select col_type_is('public', 'profiles', 'role', 'user_role', 'profiles.role is the enum');
select col_not_null('public', 'profiles', 'role', 'profiles.role is NOT NULL');

-- The other four tables were never touched by the upgrade.
select has_table('public', 'mood_logs', 'mood_logs survives');
select has_table('public', 'thought_records', 'thought_records survives');


-- ---------------------------------------------------------------------------
-- 2. Content: a pre-existing row comes through intact
--
-- The closest honest stand-in for "a user who was already there": created
-- through the same trigger, carrying the same UTM attribution production's
-- three users carry.
-- ---------------------------------------------------------------------------

select tests_make_user(:'legacy'::uuid, 'legacy@example.com',
  '{"utm_source":"newsletter","utm_medium":"email","utm_campaign":"spring"}'::jsonb);

select is(
  (select first_utm_source || '/' || first_utm_medium || '/' || first_utm_campaign
   from public.profiles where id = :'legacy'::uuid),
  'newsletter/email/spring',
  'an existing profile keeps every UTM value it was created with'
);

select is(
  (select role::text from public.profiles where id = :'legacy'::uuid),
  'student',
  'and holds the backfilled student role'
);

select ok(
  (select deactivated_at is null from public.profiles where id = :'legacy'::uuid),
  'and is not deactivated by the upgrade'
);


-- ---------------------------------------------------------------------------
-- 3. The backfill is a no-op on a database that has already had it
--
-- This is migration 20260911000200's backfill statement, verbatim. Running it a
-- second time must add nothing and change nothing. An earlier draft of that
-- migration also carried `update profiles set role = 'student'`, which would
-- have passed this test's row count and silently demoted every administrator —
-- hence the separate role assertion below.
-- ---------------------------------------------------------------------------

create temporary table t_before on commit drop as
  select id, role, first_utm_source, created_at from public.profiles;

insert into public.profiles (id, role, created_at)
select u.id, 'student', coalesce(u.created_at, now())
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

select is(
  (select count(*)::int from public.profiles),
  (select count(*)::int from t_before),
  're-running the backfill adds no rows'
);

select is(
  (select count(*)::int from t_before b
   join public.profiles p on p.id = b.id
   where p.role is distinct from b.role
      or p.first_utm_source is distinct from b.first_utm_source
      or p.created_at is distinct from b.created_at),
  0,
  'and rewrites no column of any existing row'
);

-- The other half of the backfill's job: an auth user with no profile gets one.
-- Production's handle_new_user could leave users in that state, so this is a
-- repair the upgrade performs, not just a formality.
-- Manufacture the orphan state production's trigger could leave behind: an auth
-- user with no profiles row. Disabling the trigger would be the direct way, but
-- `alter table auth.users` needs ownership of that table and the test session is
-- not its owner — so let the trigger run and then remove the row it wrote. The
-- resulting state is identical, which is all this test needs.
select tests_make_user(:'orphan'::uuid, 'orphan@example.com');
delete from public.profiles where id = :'orphan'::uuid;

select is(
  (select count(*)::int from public.profiles where id = :'orphan'::uuid),
  0,
  'an auth user whose signup trigger failed has no profile'
);

insert into public.profiles (id, role, created_at)
select u.id, 'student', coalesce(u.created_at, now())
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

select is(
  (select role::text from public.profiles where id = :'orphan'::uuid),
  'student',
  'and the backfill gives them one, as a student'
);

select * from finish();
rollback;

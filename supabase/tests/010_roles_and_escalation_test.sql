-- Roles: how they are assigned, and every way a user might try to change one.
--
-- Run with `supabase test db`. Everything happens inside one transaction that
-- is rolled back at the end, including the pgTAP extension and the helper
-- function, so the database is unchanged afterwards.
--
-- Test users have fixed uuids and the session switches identity with plain
-- `set local` statements rather than a helper function. That is deliberate: a
-- `SET LOCAL` issued inside a plpgsql body has subtler scoping than one issued
-- at statement level, and the identity the whole suite depends on is not the
-- place to rely on it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

\set student_a '11111111-1111-1111-1111-111111111111'
\set student_b '22222222-2222-2222-2222-222222222222'
\set the_admin '33333333-3333-3333-3333-333333333333'
\set attacker  '44444444-4444-4444-4444-444444444444'

-- Creating an auth user is the honest way to make a test subject: it fires
-- on_auth_user_created, which is itself one of the things under test. The
-- empty-string token columns are set explicitly because some GoTrue versions
-- declare them NOT NULL without a default.
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
-- A signup cannot choose its own role
--
-- The attack: raw_user_meta_data is whatever the browser passed to
-- signUp({ options: { data } }). If handle_new_user read a role out of it,
-- registering as an administrator would be a one-line change in devtools.
-- ---------------------------------------------------------------------------

select lives_ok(
  format($$ select tests_make_user(%L::uuid, 'attacker@example.com',
    '{"role":"admin","user_role":"admin","utm_source":"ad"}'::jsonb) $$, :'attacker'),
  'a signup carrying role=admin in its metadata is accepted'
);

select is(
  (select p.role::text from public.profiles p where p.id = :'attacker'::uuid),
  'student',
  'and lands as a student, not an administrator'
);

select is(
  (select p.first_utm_source from public.profiles p where p.id = :'attacker'::uuid),
  'ad',
  'while the UTM value in the same metadata blob is still captured'
);

-- Belt and braces on the same point, read off the catalog rather than the
-- behaviour. The pattern matches any `->> 'role'` extraction, not just one
-- spelled against raw_user_meta_data directly: the function aliases that column
-- to `meta`, so a check naming the column would miss `meta->>'role'` — which is
-- exactly how the mistake would be written.
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'handle_new_user'
     and p.prosrc ~* '->>\s*''(role|user_role)'''),
  0,
  'handle_new_user never reads a role out of signup metadata'
);


-- ---------------------------------------------------------------------------
-- A user cannot change their own role
-- ---------------------------------------------------------------------------

select tests_make_user(:'student_a'::uuid, 'a@example.com');
select tests_make_user(:'student_b'::uuid, 'b@example.com');
select tests_make_user(:'the_admin'::uuid, 'admin@example.com');

-- Promote the administrator the way the runbook does: disarm the guard for one
-- transaction. This is the only path, and it needs database access.
select set_config('mindful.privileged_write', 'on', true);
update public.profiles set role = 'admin' where id = :'the_admin'::uuid;
select set_config('mindful.privileged_write', 'off', true);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Barrier 1: the column grant. `authenticated` holds UPDATE on seven named
-- columns of profiles, and `role` is not one of them, so this is refused by the
-- grant system before any policy or trigger is consulted.
select throws_ok(
  $$ update public.profiles set role = 'admin' where id = auth.uid() $$,
  '42501',
  null,
  'a student cannot UPDATE their own role directly'
);

select throws_ok(
  $$ update public.profiles set deactivated_at = null where id = auth.uid() $$,
  '42501',
  null,
  'nor their own deactivated_at'
);

-- Barrier 3: the RPC refuses non-administrators.
select throws_ok(
  $$ select public.set_user_role('11111111-1111-1111-1111-111111111111'::uuid, 'admin') $$,
  '42501',
  null,
  'a student cannot promote themselves through set_user_role()'
);

select throws_ok(
  $$ select public.set_user_role('22222222-2222-2222-2222-222222222222'::uuid, 'teacher') $$,
  '42501',
  null,
  'nor promote somebody else'
);

select throws_ok(
  $$ select public.set_account_active('22222222-2222-2222-2222-222222222222'::uuid, false) $$,
  '42501',
  null,
  'nor suspend somebody else'
);

-- The permitted columns still work, or the grant would have broken the app.
select lives_ok(
  $$ update public.profiles
     set display_name = 'Sam', share_with_teachers = true
     where id = auth.uid() $$,
  'but a student can still set their own display name and visibility'
);

select is(
  (select p.role::text from public.profiles p where p.id = auth.uid()),
  'student',
  'and their role is unchanged after all of that'
);

-- Barrier 2, attacked directly.
--
-- `set_config()` is executable by PUBLIC, so a signed-in session can turn the
-- privileged-write flag on for itself. The guard trusts that flag only when
-- current_user is not a client role, so setting it as `authenticated` buys
-- nothing.
select set_config('mindful.privileged_write', 'on', true);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = auth.uid() $$,
  '42501',
  null,
  'forging the privileged-write flag as authenticated does not unlock the role column'
);

reset role;
set local request.jwt.claims to '';

-- The test above passes on the column grant alone, which would still pass if the
-- trigger were removed entirely. Granting the column for the length of this
-- transaction strips that first barrier away, so what is left to refuse the
-- update is the guard trigger and nothing else.
grant update (role) on public.profiles to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select set_config('mindful.privileged_write', 'on', true);

select throws_ok(
  $$ update public.profiles set role = 'admin' where id = auth.uid() $$,
  '42501',
  null,
  'and with the column grant handed over too, the guard trigger still refuses'
);

select is(
  (select p.role::text from public.profiles p where p.id = auth.uid()),
  'student',
  'leaving the student a student'
);

reset role;
revoke update (role) on public.profiles from authenticated;
select set_config('mindful.privileged_write', 'off', true);
set local request.jwt.claims to '';


-- ---------------------------------------------------------------------------
-- An administrator can, and it is recorded
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select lives_ok(
  $$ select public.set_user_role('22222222-2222-2222-2222-222222222222'::uuid,
                                 'teacher', 'runs a class') $$,
  'an administrator can promote another user'
);

select throws_ok(
  $$ select public.set_user_role('33333333-3333-3333-3333-333333333333'::uuid, 'student') $$,
  '42501',
  null,
  'but not change their own role'
);

select is(
  (select ra.new_role::text from public.role_change_audit ra
   where ra.target_user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  'teacher',
  'and the change is written to role_change_audit'
);

-- Both privileged RPCs still work after the guard change, which is the point
-- worth proving: they are SECURITY DEFINER, so inside them current_user is the
-- function owner rather than `authenticated`, and the flag they set is believed.
select lives_ok(
  $$ select public.set_account_active('22222222-2222-2222-2222-222222222222'::uuid, false) $$,
  'an administrator can suspend another account'
);

select ok(
  (select p.deactivated_at is not null from public.profiles p
   where p.id = '22222222-2222-2222-2222-222222222222'::uuid),
  'and the suspension lands on the profile'
);

select lives_ok(
  $$ select public.set_account_active('22222222-2222-2222-2222-222222222222'::uuid, true) $$,
  'and can be lifted again'
);

select ok(
  (select p.deactivated_at is null from public.profiles p
   where p.id = '22222222-2222-2222-2222-222222222222'::uuid),
  'leaving the account active'
);

select throws_ok(
  $$ select public.set_account_active('33333333-3333-3333-3333-333333333333'::uuid, false) $$,
  '42501',
  null,
  'but an administrator cannot suspend themselves'
);

reset role;
set local request.jwt.claims to '';

select * from finish();
rollback;

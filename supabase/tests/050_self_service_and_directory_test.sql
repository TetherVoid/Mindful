-- Self-service deactivation, and the administrator's user directory.
--
-- The two things worth proving about deactivate_my_account() are that it reaches
-- exactly one row and that it only moves in one direction. The two worth proving
-- about admin_list_users() are that a non-administrator cannot call it at all,
-- and that its limit is a cap rather than a suggestion.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

\set quitter   '77777777-7777-7777-7777-777777777777'
\set bystander '88888888-8888-8888-8888-888888888888'
\set the_admin '99999999-9999-9999-9999-999999999999'
\set teacher   'aaaa1111-aaaa-1111-aaaa-111111111111'

create or replace function tests_make_user(p_id uuid, p_email text, p_name text default null)
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
    '{"provider":"email","providers":["email"]}'::jsonb,
    case when p_name is null then '{}'::jsonb else jsonb_build_object('full_name', p_name) end,
    '', '', '', ''
  );
  return p_id;
end;
$$;

select tests_make_user(:'quitter'::uuid,   'quitter@example.com', 'Robin Quitter');
select tests_make_user(:'bystander'::uuid, 'bystander@example.com', 'Sam Bystander');
select tests_make_user(:'the_admin'::uuid, 'boss@example.com', 'Alex Boss');
select tests_make_user(:'teacher'::uuid,   'teach@example.com', 'Kit Teacher');

select set_config('mindful.privileged_write', 'on', true);
update public.profiles set role = 'admin'   where id = :'the_admin'::uuid;
update public.profiles set role = 'teacher' where id = :'teacher'::uuid;
select set_config('mindful.privileged_write', 'off', true);

-- A class, so there is a membership for deactivation to clear.
create temporary table t_class (id uuid, code text) on commit drop;
grant all on t_class to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaa1111-aaaa-1111-aaaa-111111111111","role":"authenticated"}';
select public.create_class('Deactivation test group');
insert into t_class select c.id, c.join_code from public.classes c
  where c.name = 'Deactivation test group';

set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
select public.join_class((select code from t_class));


-- ---------------------------------------------------------------------------
-- A user can switch themselves off
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.class_members where user_id = auth.uid()),
  1,
  'the quitter is enrolled in a class before they leave'
);

select lives_ok(
  $$ select public.deactivate_my_account() $$,
  'a signed-in user can deactivate their own account'
);

select ok(
  (select p.deactivated_at is not null from public.profiles p where p.id = :'quitter'::uuid),
  'and deactivated_at is set on their profile'
);

select is(
  (select count(*)::int from public.class_members
   where user_id = :'quitter'::uuid),
  0,
  'and their class membership is cleared, so they leave the roster'
);

-- Deactivation means losing access to the journal, which is the point of the
-- `not is_deactivated()` clause on the four owner policies.
select is(
  (select count(*)::int from public.mood_logs),
  0,
  'a deactivated account can no longer read its own journal'
);

select throws_ok(
  $$ insert into public.mood_logs (user_id, mood_score) values (auth.uid(), 3) $$,
  '42501',
  null,
  'nor write to it'
);

-- Calling again is a no-op rather than an error, and does not move the
-- timestamp — so a double-click cannot rewrite when the account was closed.
select is(
  (select public.deactivate_my_account()),
  false,
  'calling it again reports that nothing changed'
);


-- ---------------------------------------------------------------------------
-- It cannot reach anybody else, and it cannot be undone
-- ---------------------------------------------------------------------------

-- Read as the session owner, not as the quitter. `profiles: owner read` means a
-- signed-in user can see exactly one profile row — their own — so asking this
-- question as the quitter returns no rows and a NULL, which is RLS working and
-- an assertion that proves nothing. (It failed that way first.)
reset role;

select ok(
  (select p.deactivated_at is null from public.profiles p where p.id = :'bystander'::uuid),
  'nobody else was deactivated by that call'
);

-- The function takes no arguments, so there is no id to substitute. Proving the
-- absence of a parameter is the honest version of "it cannot name someone else".
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'deactivate_my_account'
     and p.pronargs = 0),
  1,
  'deactivate_my_account takes no arguments, so there is nowhere to name a victim'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';

select throws_ok(
  $$ select public.set_account_active('77777777-7777-7777-7777-777777777777'::uuid, true) $$,
  '42501',
  null,
  'and a deactivated user cannot reactivate themselves'
);

select throws_ok(
  $$ select public.set_account_active('88888888-8888-8888-8888-888888888888'::uuid, false) $$,
  '42501',
  null,
  'nor deactivate anybody else through the admin RPC'
);

-- An ordinary, active user is refused the admin RPC too — deactivation is not
-- what is stopping them.
set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';
select throws_ok(
  $$ select public.set_account_active('77777777-7777-7777-7777-777777777777'::uuid, true) $$,
  '42501',
  null,
  'an active non-administrator cannot reactivate anyone either'
);

-- Reactivation is the administrator's, and it works.
set local request.jwt.claims to '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
select lives_ok(
  $$ select public.set_account_active('77777777-7777-7777-7777-777777777777'::uuid, true) $$,
  'an administrator can reactivate them'
);
select ok(
  (select p.deactivated_at is null from public.profiles p where p.id = :'quitter'::uuid),
  'and the account comes back'
);


-- ---------------------------------------------------------------------------
-- The directory
-- ---------------------------------------------------------------------------

reset role;
select is(
  (select has_function_privilege('anon', 'public.admin_list_users(text,integer,integer)', 'EXECUTE')),
  false,
  'anon cannot execute admin_list_users'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';
select throws_ok(
  $$ select * from public.admin_list_users() $$,
  '42501',
  null,
  'a non-administrator calling admin_list_users is refused'
);

set local request.jwt.claims to '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

select is(
  (select count(*)::int from public.admin_list_users()),
  4,
  'an administrator sees every account'
);

select is(
  (select u.email from public.admin_list_users('boss@example.com') u),
  'boss@example.com',
  'search matches on email'
);

select is(
  (select u.display_name from public.admin_list_users('Robin') u),
  'Robin Quitter',
  'and on display name'
);

select is(
  (select count(*)::int from public.admin_list_users('no-such-person')),
  0,
  'a search that matches nothing returns nothing rather than everything'
);

-- ILIKE would treat an underscore as "any character" without the escaping in the
-- function; 'b_ss' must not match 'boss'.
select is(
  (select count(*)::int from public.admin_list_users('b_ss')),
  0,
  'wildcards in the search term are escaped, not honoured'
);

-- Pagination.
select is(
  (select count(*)::int from public.admin_list_users(null, 2, 0)),
  2,
  'page_limit bounds the page'
);

select isnt(
  (select u.id from public.admin_list_users(null, 1, 0) u),
  (select u.id from public.admin_list_users(null, 1, 1) u),
  'and page_offset moves to a different row'
);


-- ---------------------------------------------------------------------------
-- The cap is a cap
--
-- Asking for a thousand has to return a hundred, so there have to be more than a
-- hundred accounts to ask about.
-- ---------------------------------------------------------------------------

reset role;
select tests_make_user(
  ('bbbb0000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  format('bulk-%s@example.com', i)
)
from generate_series(1, 120) as i;

set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

select is(
  (select count(*)::int from public.admin_list_users(null, 1000, 0)),
  100,
  'asking for a thousand rows returns the hundred the function will give'
);

select is(
  (select count(*)::int from public.admin_list_users(null, 0, 0)),
  1,
  'and asking for zero returns one rather than an empty page or an error'
);

reset role;
set local request.jwt.claims to '';

select * from finish();
rollback;

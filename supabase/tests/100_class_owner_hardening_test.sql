-- Migration 20261009000100: a class belongs to a teacher only while they are
-- one; a suspended student is visible to nobody; a suspended account cannot
-- edit its own profile. Before it, a demoted or suspended owner kept every
-- class power, a suspended student re-enrolled by an administrator was visible,
-- and a suspended account could rename itself and flip share_with_teachers.

begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

\set the_admin 'd0d0d0d0-0000-0000-0000-000000000001'
\set owner     'd0d0d0d0-0000-0000-0000-000000000002'
\set co        'd0d0d0d0-0000-0000-0000-000000000003'
\set s1        'd0d0d0d0-0000-0000-0000-000000000004'
\set s2        'd0d0d0d0-0000-0000-0000-000000000005'
\set s3        'd0d0d0d0-0000-0000-0000-000000000006'

create or replace function tests_make_user(p_id uuid, p_email text)
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
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', ''
  );
  return p_id;
end;
$$;

-- Rows touched by one statement, run as whoever is calling. RLS refusals on
-- UPDATE and DELETE are silent, so the count is the assertion.
create or replace function tests_rows(p_sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function tests_rows(text) to authenticated;

select tests_make_user(:'the_admin'::uuid, 'h-admin@example.com');
select tests_make_user(:'owner'::uuid,     'h-owner@example.com');
select tests_make_user(:'co'::uuid,        'h-co@example.com');
select tests_make_user(:'s1'::uuid,        'h-s1@example.com');
select tests_make_user(:'s2'::uuid,        'h-s2@example.com');
select tests_make_user(:'s3'::uuid,        'h-s3@example.com');

select set_config('mindful.privileged_write', 'on', true);
update public.profiles set role = 'admin'   where id = :'the_admin'::uuid;
update public.profiles set role = 'teacher' where id in (:'owner'::uuid, :'co'::uuid);
select set_config('mindful.privileged_write', 'off', true);

update public.profiles set share_with_teachers = true, display_name = 'Sky' where id = :'s1'::uuid;
update public.profiles set share_with_teachers = true, display_name = 'Sam' where id = :'s2'::uuid;
update public.profiles set share_with_teachers = true, display_name = 'Sol' where id = :'s3'::uuid;
insert into public.mood_logs (user_id, mood_score) values (:'s1'::uuid, 3), (:'s2'::uuid, 4);

create temporary table t_class (id uuid, code text) on commit drop;
grant all on t_class to authenticated;

set local role authenticated;

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000002","role":"authenticated"}';
select public.create_class('Form 9C');
insert into t_class select c.id, c.join_code from public.classes c where c.name = 'Form 9C';

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000004","role":"authenticated"}';
select public.join_class((select code from t_class));
set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000005","role":"authenticated"}';
select public.join_class((select code from t_class));
set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000006","role":"authenticated"}';
select public.join_class((select code from t_class));


-- ---------------------------------------------------------------------------
-- A. The owner is demoted to student
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000001","role":"authenticated"}';
select public.set_user_role(:'owner'::uuid, 'student', 'pgtap: demoted');

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok($$ select * from public.class_roster((select id from t_class)) $$,
  '42501', null, 'a demoted owner cannot read the roster');                               -- 1
select throws_ok($$ select * from public.class_overview((select id from t_class)) $$,
  '42501', null, 'nor the overview');                                                     -- 2
select throws_ok($$ select public.rotate_join_code((select id from t_class)) $$,
  '42501', null, 'nor rotate the join code');                                             -- 3
select throws_ok(
  $$ insert into public.class_teachers (class_id, user_id, added_by)
     select id, 'd0d0d0d0-0000-0000-0000-000000000003'::uuid, auth.uid() from t_class $$,
  '42501', null, 'nor add a co-teacher (RLS WITH CHECK violation)');                      -- 4
select is(tests_rows($$ update public.classes set name = 'Taken'
                        where id = (select id from t_class) $$), 0,
  'nor rename the class');                                                                -- 5
select is(public.is_class_owner((select id from t_class)), false,
  'and is_class_owner() says no');                                                        -- 6


-- ---------------------------------------------------------------------------
-- A2. A co-teacher who is demoted loses the class too
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000001","role":"authenticated"}';
select public.set_user_role(:'owner'::uuid, 'teacher', 'pgtap: restored');

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ insert into public.class_teachers (class_id, user_id, added_by)
     select id, 'd0d0d0d0-0000-0000-0000-000000000003'::uuid, auth.uid() from t_class
     on conflict do nothing $$,
  'a restored owner can add a co-teacher again');                                         -- 7

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.class_roster((select id from t_class))), 3,
  'the co-teacher reads the roster');                                                     -- 8

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000001","role":"authenticated"}';
select public.set_user_role(:'co'::uuid, 'student', 'pgtap: co demoted');

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok($$ select * from public.class_roster((select id from t_class)) $$,
  '42501', null, 'until demoted, when the roster is refused');                            -- 9
select is(tests_rows($$ delete from public.class_members
                        where class_id = (select id from t_class)
                          and user_id = 'd0d0d0d0-0000-0000-0000-000000000006' $$), 0,
  'and a demoted co-teacher cannot remove a student');                                    -- 10


-- ---------------------------------------------------------------------------
-- B. The owner is suspended
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000001","role":"authenticated"}';
select public.set_account_active(:'owner'::uuid, false);

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000002","role":"authenticated"}';
select is(tests_rows($$ update public.classes set archived = true
                        where id = (select id from t_class) $$), 0,
  'a suspended owner cannot archive the class');                                          -- 11
select is(tests_rows($$ delete from public.class_members
                        where class_id = (select id from t_class)
                          and user_id = 'd0d0d0d0-0000-0000-0000-000000000004' $$), 0,
  'nor remove a student');                                                                -- 12
select throws_ok($$ select * from public.class_roster((select id from t_class)) $$,
  '42501', null, 'nor read the roster');                                                  -- 13
select throws_ok($$ select public.rotate_join_code((select id from t_class)) $$,
  '42501', null, 'nor rotate the code');                                                  -- 14

reset role;
select is((select archived from public.classes where id = (select id from t_class)), false,
  'the class is still live');                                                             -- 15
select is((select count(*)::int from public.class_members where class_id = (select id from t_class)), 3,
  'and nobody was removed');                                                              -- 16

-- Undo anything the old schema let through, so each later section fails or
-- passes on its own merits.
update public.classes set archived = false where id = (select id from t_class);
insert into public.class_members (class_id, user_id)
  select id, u from t_class, unnest(array[:'s1'::uuid, :'s3'::uuid]) u
  on conflict do nothing;


-- ---------------------------------------------------------------------------
-- C. Control: an active teacher keeps every power
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000001","role":"authenticated"}';
select public.set_account_active(:'owner'::uuid, true);

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.class_roster((select id from t_class))), 3,
  'reactivated, the owner reads the roster');                                             -- 17
select isnt(public.rotate_join_code((select id from t_class)), (select code from t_class),
  'rotates the code');                                                                    -- 18
select is(tests_rows($$ update public.classes set name = 'Form 9C (renamed)'
                        where id = (select id from t_class) $$), 1,
  'renames the class');                                                                   -- 19
select is(tests_rows($$ delete from public.class_members
                        where class_id = (select id from t_class)
                          and user_id = 'd0d0d0d0-0000-0000-0000-000000000006' $$), 1,
  'and removes a student');                                                               -- 20


-- ---------------------------------------------------------------------------
-- D. A suspended student, re-enrolled by an administrator, is visible to nobody
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000001","role":"authenticated"}';
select public.set_account_active(:'s1'::uuid, false);

reset role;
select is((select count(*)::int from public.class_members where user_id = :'s1'::uuid), 0,
  'suspension still clears the student''s memberships');                                  -- 21

set local role authenticated;
insert into public.class_members (class_id, user_id, added_by)
  select id, 'd0d0d0d0-0000-0000-0000-000000000004'::uuid, auth.uid() from t_class;

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.may_view_student(:'s1'::uuid), false,
  'the teacher cannot view a suspended student, even re-enrolled and sharing');           -- 22
select is(public.may_view_student(:'s2'::uuid), true,
  'but still views an active sharing student');                                           -- 23
select is((select count(*)::int from public.class_overview((select id from t_class)) co
           where co.user_id = :'s1'::uuid), 0,
  'the overview omits the suspended student');                                            -- 24
select is((select count(*)::int from public.class_overview((select id from t_class)) co
           where co.user_id = :'s2'::uuid), 1,
  'and carries the active one');                                                          -- 25
select throws_ok($$ select * from public.student_overview('d0d0d0d0-0000-0000-0000-000000000004'::uuid) $$,
  '42501', null, 'the suspended student''s overview is refused to the teacher');          -- 26

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.may_view_student(:'s1'::uuid), false,
  'an administrator cannot view a suspended student');                                    -- 27
select is(public.may_view_student(:'s2'::uuid), true,
  'but can view an active sharing one');                                                  -- 28

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000004","role":"authenticated"}';
select is(public.may_view_student(auth.uid()), false,
  'a suspended student gets nothing about themselves either');                            -- 29
select throws_ok($$ select * from public.student_mood_series(auth.uid()) $$,
  '42501', null, 'so the definer reads are no way round the journal lockout');            -- 30


-- ---------------------------------------------------------------------------
-- E. A suspended account cannot edit its profile
-- ---------------------------------------------------------------------------

select is(tests_rows($$ update public.profiles set display_name = 'renamed' where id = auth.uid() $$), 0,
  'a suspended student cannot change their display name');                                -- 31
select is(tests_rows($$ update public.profiles set share_with_teachers = false where id = auth.uid() $$), 0,
  'nor their sharing choice');                                                            -- 32
-- display_name and share_with_teachers are the only columns still granted
-- (20260927000100 revoked the campaign tags); both at once, too.
select is(tests_rows($$ update public.profiles set display_name = 'x', share_with_teachers = false
                        where id = auth.uid() $$), 0,
  'nor both together');                                                                   -- 33

reset role;
select ok((select p.share_with_teachers and p.display_name = 'Sky' and p.first_utm_source is null
           from public.profiles p where p.id = :'s1'::uuid),
  'the profile is as it was');                                                            -- 34

set local role authenticated;
set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000005","role":"authenticated"}';
select is(tests_rows($$ update public.profiles set display_name = 'Sam B' where id = auth.uid() $$), 1,
  'an active student still can');                                                         -- 35

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.set_account_active(:'s1'::uuid, true), true,
  'set_account_active still reactivates through the new policy');                         -- 36

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000004","role":"authenticated"}';
select is(tests_rows($$ update public.profiles set display_name = 'Sky again' where id = auth.uid() $$), 1,
  'and a reactivated student can edit again');                                            -- 37

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000005","role":"authenticated"}';
select is(public.deactivate_my_account(), true,
  'deactivate_my_account still works');                                                   -- 38
select is(tests_rows($$ update public.profiles set display_name = 'after' where id = auth.uid() $$), 0,
  'and after it the profile is read-only');                                               -- 39

reset role;
select ok((select p.deactivated_at is not null from public.profiles p where p.id = :'s2'::uuid),
  'self-deactivation is recorded');                                                       -- 40


-- ---------------------------------------------------------------------------
-- F. A suspended owner cannot delete the class (last: the old schema cascades)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000001","role":"authenticated"}';
select public.set_account_active(:'owner'::uuid, false);

set local request.jwt.claims to '{"sub":"d0d0d0d0-0000-0000-0000-000000000002","role":"authenticated"}';
select is(tests_rows($$ delete from public.classes where id = (select id from t_class) $$), 0,
  'a suspended owner cannot delete the class');                                           -- 41

reset role;
select is((select count(*)::int from public.classes where id = (select id from t_class)), 1,
  'the class and its enrolments survive');                                                -- 42


-- ---------------------------------------------------------------------------
-- G. Shape
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.is_class_teacher(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.is_class_owner(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.may_view_student(uuid)', 'EXECUTE'),
  'anonymous callers still cannot execute the helpers');                                  -- 43
select ok(
  has_function_privilege('authenticated', 'public.is_class_teacher(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.is_class_owner(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.may_view_student(uuid)', 'EXECUTE'),
  'signed-in callers still can');                                                         -- 44
select is(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('is_class_teacher', 'is_class_owner', 'may_view_student')),
  true,
  'all three stay SECURITY DEFINER with a pinned search_path');                           -- 45

select * from finish();
rollback;

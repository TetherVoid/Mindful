-- Migration 20260926000100: teacher overviews carry dates, not times; and a
-- persistent, per-student and per-deployment limit on AI readings.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

\set teacher  'c1c1c1c1-0000-0000-0000-000000000001'
\set sharer   'c1c1c1c1-0000-0000-0000-000000000002'
\set private  'c1c1c1c1-0000-0000-0000-000000000003'
\set other    'c1c1c1c1-0000-0000-0000-000000000004'
\set stale    'c1c1c1c1-0000-0000-0000-000000000005'
\set gone     'c1c1c1c1-0000-0000-0000-000000000006'
\set filler   'c1c1c1c1-0000-0000-0000-000000000007'
\set late     'c1c1c1c1-0000-0000-0000-000000000008'

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
    -- Created two days ago: since 20260927000200 an account needs to be a day
    -- old before claim_report_slot() will grant it anything.
    p_email, 'x', now(), now() - interval '2 days', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', ''
  );
  return p_id;
end;
$$;

select tests_make_user(:'teacher'::uuid, 'b-teacher@example.com');
select tests_make_user(:'sharer'::uuid,  'b-sharer@example.com');
select tests_make_user(:'private'::uuid, 'b-private@example.com');
select tests_make_user(:'other'::uuid,   'b-other@example.com');
select tests_make_user(:'stale'::uuid,   'b-stale@example.com');
select tests_make_user(:'gone'::uuid,    'b-gone@example.com');
select tests_make_user(:'filler'::uuid,  'b-filler@example.com');
select tests_make_user(:'late'::uuid,    'b-late@example.com');

select set_config('mindful.privileged_write', 'on', true);
update public.profiles set role = 'teacher' where id = :'teacher'::uuid;
select set_config('mindful.privileged_write', 'off', true);
update public.profiles set share_with_teachers = true where id = :'sharer'::uuid;

-- A mood written at a specific time, so the test can see the time disappear.
insert into public.mood_logs (user_id, mood_score, created_at)
  values (:'sharer'::uuid, 3, date_trunc('day', now()) + interval '2 hours 17 minutes');

create temporary table t_class (id uuid, code text) on commit drop;
grant all on t_class to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1c1c1c1-0000-0000-0000-000000000001","role":"authenticated"}';
select public.create_class('Phase B form');
insert into t_class select c.id, c.join_code from public.classes c where c.name = 'Phase B form';
set local request.jwt.claims to '{"sub":"c1c1c1c1-0000-0000-0000-000000000002","role":"authenticated"}';
select public.join_class((select code from t_class));
set local request.jwt.claims to '{"sub":"c1c1c1c1-0000-0000-0000-000000000003","role":"authenticated"}';
select public.join_class((select code from t_class));


-- ---------------------------------------------------------------------------
-- Part 1: overviews carry dates, not times
-- ---------------------------------------------------------------------------

reset role;

select is(
  pg_get_function_result('public.class_overview(uuid,integer)'::regprocedure),
  'TABLE(user_id uuid, display_name text, mood_entries integer, average_mood numeric, last_mood_at date, active_habits integer, habit_ticks integer, thought_record_count integer, last_activity_at date)',
  'class_overview returns last_mood_at and last_activity_at as dates, under the same names'
);

select is(
  pg_get_function_result('public.student_overview(uuid,integer)'::regprocedure),
  'TABLE(user_id uuid, display_name text, mood_entries integer, average_mood numeric, last_mood_at date, active_habits integer, habit_ticks integer, thought_record_count integer, last_activity_at date)',
  'and so does student_overview'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1c1c1c1-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select co.last_mood_at from public.class_overview((select id from t_class)) co),
  current_date,
  'the teacher sees the day the student last logged a mood'
);

select is(
  (select so.last_activity_at from public.student_overview(:'sharer'::uuid) so),
  current_date,
  'and the day of their last activity, with no time attached'
);

select is(
  (select count(*)::int from public.class_overview((select id from t_class))),
  1,
  'consent still decides who appears: only the student who shares'
);

select throws_ok(
  $$ select * from public.student_overview('c1c1c1c1-0000-0000-0000-000000000003'::uuid) $$,
  '42501', null,
  'and the private student is still refused to the teacher'
);

reset role;
set local request.jwt.claims to '';

select is(has_function_privilege('anon', 'public.class_overview(uuid,integer)', 'EXECUTE'), false,
  'anon cannot execute class_overview');
select is(has_function_privilege('anon', 'public.student_overview(uuid,integer)', 'EXECUTE'), false,
  'anon cannot execute student_overview');
select is(has_function_privilege('authenticated', 'public.class_overview(uuid,integer)', 'EXECUTE'), true,
  'authenticated can execute class_overview');
select is(has_function_privilege('authenticated', 'public.student_overview(uuid,integer)', 'EXECUTE'), true,
  'authenticated can execute student_overview');


-- ---------------------------------------------------------------------------
-- Part 2: nobody touches report_requests directly
-- ---------------------------------------------------------------------------

select is(pg_get_function_arguments('public.claim_report_slot()'::regprocedure), '',
  'claim_report_slot takes no arguments, so a caller cannot name anyone else');
select is(has_function_privilege('anon', 'public.claim_report_slot()', 'EXECUTE'), false,
  'anon cannot execute claim_report_slot');
select is(has_function_privilege('authenticated', 'public.claim_report_slot()', 'EXECUTE'), true,
  'authenticated can');

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1c1c1c1-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok($$ select * from public.report_requests $$, '42501', null,
  'a signed-in user cannot read report_requests');
select throws_ok($$ insert into public.report_requests (user_id) values (auth.uid()) $$, '42501', null,
  'nor insert into it');
select throws_ok($$ delete from public.report_requests $$, '42501', null,
  'nor delete from it');


-- ---------------------------------------------------------------------------
-- Part 2: three a day per student
-- ---------------------------------------------------------------------------

select is(public.claim_report_slot(), 'ok', 'first reading of the day is allowed');
select is(public.claim_report_slot(), 'ok', 'second');
select is(public.claim_report_slot(), 'ok', 'third');
select is(public.claim_report_slot(), 'user_limit', 'the fourth in 24 hours is refused');

set local request.jwt.claims to '{"sub":"c1c1c1c1-0000-0000-0000-000000000004","role":"authenticated"}';
select is(public.claim_report_slot(), 'ok', 'another student''s limit is their own');

set local request.jwt.claims to '';
select throws_ok($$ select public.claim_report_slot() $$, '42501', null,
  'a caller with no identity is refused');


-- ---------------------------------------------------------------------------
-- Part 2: the window rolls, and old rows are pruned
-- ---------------------------------------------------------------------------

reset role;
insert into public.report_requests (user_id, created_at) values
  (:'stale'::uuid, now() - interval '25 hours'),
  (:'stale'::uuid, now() - interval '26 hours'),
  (:'stale'::uuid, now() - interval '27 hours'),
  (:'stale'::uuid, now() - interval '49 hours');

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1c1c1c1-0000-0000-0000-000000000005","role":"authenticated"}';
select is(public.claim_report_slot(), 'ok',
  'readings more than 24 hours old do not count against the limit');

reset role;
select is(
  (select count(*)::int from public.report_requests
   where user_id = :'stale'::uuid and created_at < now() - interval '48 hours'),
  0,
  'and rows older than 48 hours are pruned on the next claim'
);


-- ---------------------------------------------------------------------------
-- Part 2: deactivated accounts, deleted accounts
-- ---------------------------------------------------------------------------

select set_config('mindful.privileged_write', 'on', true);
update public.profiles set deactivated_at = now() where id = :'gone'::uuid;
select set_config('mindful.privileged_write', 'off', true);

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1c1c1c1-0000-0000-0000-000000000006","role":"authenticated"}';
select throws_ok($$ select public.claim_report_slot() $$, '42501', null,
  'a deactivated account cannot claim a reading');

reset role;
set local request.jwt.claims to '';
select is((select count(*)::int from public.report_requests where user_id = :'sharer'::uuid), 3,
  'the three claims are on record');
delete from auth.users where id = :'sharer'::uuid;
select is((select count(*)::int from public.report_requests where user_id = :'sharer'::uuid), 0,
  'and go with the account when it is deleted');


-- ---------------------------------------------------------------------------
-- Part 2: three hundred a day across the deployment
-- ---------------------------------------------------------------------------

-- Seed the deployment to one short of its limit (what is on record, plus
-- filler rows), then take the last slot and try for one more.
insert into public.report_requests (user_id, created_at)
  select :'filler'::uuid, now() - interval '1 hour'
  from generate_series(1, 299 - (select count(*) from public.report_requests
                                  where created_at > now() - interval '24 hours'));

set local role authenticated;
set local request.jwt.claims to '{"sub":"c1c1c1c1-0000-0000-0000-000000000004","role":"authenticated"}';
select is(public.claim_report_slot(), 'ok', 'the 300th reading of the day is allowed');

set local request.jwt.claims to '{"sub":"c1c1c1c1-0000-0000-0000-000000000008","role":"authenticated"}';
select is(public.claim_report_slot(), 'global_limit',
  'the 301st is refused, even for a student who has had none');

reset role;
select is((select count(*)::int from public.report_requests where user_id = :'late'::uuid), 0,
  'and a refused claim records nothing');

select * from finish();
rollback;

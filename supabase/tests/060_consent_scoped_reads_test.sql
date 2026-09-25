-- Consent governs every read of a student's figures, administrators included.
--
-- Migration 20260925000100 makes share_with_teachers the rule for anyone who is
-- not the student: a teacher still needs a live class and consent, and an
-- administrator now needs consent and a live class too. It also strips
-- logged_at from the mood series and habit names from the habit summary, and
-- makes class_overview() honour archiving. Each of those is held to its word
-- below.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

\set teacher    'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'
\set the_admin  'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2'
\set sharing    'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'
\set private    'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'
\set unenrolled 'b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3'
\set archived   'b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4'

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

select tests_make_user(:'teacher'::uuid,    'teach@example.com');
select tests_make_user(:'the_admin'::uuid,  'admin@example.com');
select tests_make_user(:'sharing'::uuid,    'share@example.com');
select tests_make_user(:'private'::uuid,    'private@example.com');
select tests_make_user(:'unenrolled'::uuid, 'alone@example.com');
select tests_make_user(:'archived'::uuid,   'old@example.com');

select set_config('mindful.privileged_write', 'on', true);
update public.profiles set role = 'teacher' where id = :'teacher'::uuid;
update public.profiles set role = 'admin'   where id = :'the_admin'::uuid;
select set_config('mindful.privileged_write', 'off', true);

-- Three students opt in; one keeps their figures private.
update public.profiles set share_with_teachers = true
  where id in (:'sharing'::uuid, :'unenrolled'::uuid, :'archived'::uuid);

-- Something to read for the sharing student: two moods on one day, and a habit
-- with a name nobody but the student should ever see.
insert into public.mood_logs (user_id, mood_score, note, created_at) values
  (:'sharing'::uuid, 2, 'a private note', now() - interval '2 hours'),
  (:'sharing'::uuid, 4, 'another note',  now() - interval '1 hour');
insert into public.habits (id, user_id, name, created_at) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', :'sharing'::uuid, 'take my medication', now() - interval '3 days'),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', :'sharing'::uuid, 'call my sister',      now() - interval '2 days');
insert into public.habit_logs (habit_id, user_id, date) values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', :'sharing'::uuid, current_date),
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', :'sharing'::uuid, current_date - 1);

create temporary table t_class (label text primary key, id uuid, code text) on commit drop;
grant all on t_class to authenticated;

set local role authenticated;

-- The teacher opens a live class and one that will be archived.
set local request.jwt.claims to '{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}';
select public.create_class('Live form group');
select public.create_class('Last year');
insert into t_class select 'live', c.id, c.join_code from public.classes c where c.name = 'Live form group';
insert into t_class select 'old',  c.id, c.join_code from public.classes c where c.name = 'Last year';

set local request.jwt.claims to '{"sub":"b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1","role":"authenticated"}';
select public.join_class((select code from t_class where label = 'live'));
set local request.jwt.claims to '{"sub":"b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2","role":"authenticated"}';
select public.join_class((select code from t_class where label = 'live'));
set local request.jwt.claims to '{"sub":"b4b4b4b4-b4b4-b4b4-b4b4-b4b4b4b4b4b4","role":"authenticated"}';
select public.join_class((select code from t_class where label = 'old'));

set local request.jwt.claims to '{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}';
update public.classes set archived = true where id = (select id from t_class where label = 'old');


-- ---------------------------------------------------------------------------
-- An administrator needs the student's consent
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2","role":"authenticated"}';

select is(public.may_view_student(:'sharing'::uuid), true,
  'an administrator may view a student who opted in and is in a live class');

select is(public.may_view_student(:'private'::uuid), false,
  'but not a student who kept their figures private');

select is(public.may_view_student(:'unenrolled'::uuid), false,
  'nor an opted-in student who is in no class at all');

select is(public.may_view_student(:'archived'::uuid), false,
  'nor an opted-in student whose only class is archived');

select throws_ok(
  $$ select * from public.student_overview('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'::uuid) $$,
  '42501', null,
  'so the private student''s overview is refused to an administrator'
);

select throws_ok(
  $$ select * from public.student_mood_series('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'::uuid) $$,
  '42501', null,
  'as is their mood series'
);

select throws_ok(
  $$ select * from public.student_habit_summary('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'::uuid) $$,
  '42501', null,
  'and their habit summary'
);

select is(
  (select count(*)::int from public.class_overview((select id from t_class where label = 'live'))),
  1,
  'an administrator''s class overview carries only the consenting student'
);

select is(
  (select co.user_id from public.class_overview((select id from t_class where label = 'live')) co),
  :'sharing'::uuid,
  'and it is the right one'
);

select is(
  (select count(*)::int from public.class_roster((select id from t_class where label = 'live'))),
  2,
  'administration is unchanged: the roster still lists everyone enrolled'
);


-- ---------------------------------------------------------------------------
-- Archiving ends a teacher's view of the class's figures
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}';

select is(
  (select count(*)::int from public.class_overview((select id from t_class where label = 'old'))),
  0,
  'the teacher of an archived class gets no figures from its overview'
);

select is(
  (select count(*)::int from public.class_overview((select id from t_class where label = 'live'))),
  1,
  'while their live class still shows the consenting student'
);

select is(public.may_view_student(:'private'::uuid), false,
  'and the private student stays private to the teacher too');


-- ---------------------------------------------------------------------------
-- What the teacher is handed: no times, no habit names
-- ---------------------------------------------------------------------------

select is(
  pg_get_function_result('public.student_mood_series(uuid,integer)'::regprocedure),
  'TABLE(day date, mood_score smallint)',
  'student_mood_series returns the day and the score, and no time of day'
);

select is(
  (select count(*)::int from public.student_mood_series(:'sharing'::uuid)),
  2,
  'one row per entry, so two moods on one day are both there'
);

select is(
  pg_get_function_result('public.student_habit_summary(uuid,integer)'::regprocedure),
  'TABLE(habit_number integer, ticks integer, last_tick date)',
  'student_habit_summary returns numbered counts, with no name and no id'
);

select is(
  (select array_agg(s.ticks order by s.habit_number) from public.student_habit_summary(:'sharing'::uuid) s),
  array[2, 0],
  'habits are numbered in the order they were created, with their tick counts'
);

select is(
  (select array_agg(s.habit_number order by s.habit_number) from public.student_habit_summary(:'sharing'::uuid) s),
  array[1, 2],
  'and numbered from one'
);


-- ---------------------------------------------------------------------------
-- Withdrawing consent closes the door for both roles at once
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1","role":"authenticated"}';
update public.profiles set share_with_teachers = false where id = auth.uid();

select is(public.may_view_student(auth.uid()), true,
  'a student can always read their own figures, shared or not');

set local request.jwt.claims to '{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}';
select is(public.may_view_student(:'sharing'::uuid), false,
  'once they opt out, their teacher loses access');

set local request.jwt.claims to '{"sub":"a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2","role":"authenticated"}';
select is(public.may_view_student(:'sharing'::uuid), false,
  'and so does the administrator');

select is(
  (select count(*)::int from public.class_overview((select id from t_class where label = 'live'))),
  0,
  'the administrator''s overview is now empty'
);


-- ---------------------------------------------------------------------------
-- The recreated functions kept their grants
-- ---------------------------------------------------------------------------

reset role;
set local request.jwt.claims to '';

select is(has_function_privilege('anon', 'public.student_mood_series(uuid,integer)', 'EXECUTE'), false,
  'anon cannot execute student_mood_series');
select is(has_function_privilege('anon', 'public.student_habit_summary(uuid,integer)', 'EXECUTE'), false,
  'anon cannot execute student_habit_summary');
select is(has_function_privilege('authenticated', 'public.student_mood_series(uuid,integer)', 'EXECUTE'), true,
  'authenticated can execute student_mood_series');
select is(has_function_privilege('authenticated', 'public.student_habit_summary(uuid,integer)', 'EXECUTE'), true,
  'authenticated can execute student_habit_summary');

select * from finish();
rollback;

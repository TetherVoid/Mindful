-- Migration 20260927000100: text limits, daily insert quotas, and server-set
-- created_at. Every refusal below is something the schema accepted before it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

\set writer 'd1d1d1d1-0000-0000-0000-000000000001'
\set other  'd1d1d1d1-0000-0000-0000-000000000002'

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
    p_email, 'x', now(), now() - interval '2 days', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', ''
  );
  return p_id;
end;
$$;

select tests_make_user(:'writer'::uuid, 'q-writer@example.com');
select tests_make_user(:'other'::uuid,  'q-other@example.com');

-- A habit to tick, made before the role switch.
insert into public.habits (id, user_id, name)
  values ('d1d1d1d1-0000-0000-0000-00000000aaaa', :'writer'::uuid, 'Walk');

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1d1d1d1-0000-0000-0000-000000000001","role":"authenticated"}';


-- ---------------------------------------------------------------------------
-- Text limits: exactly at the limit is accepted, one over is refused
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.mood_logs (user_id, mood_score, note) values (auth.uid(), 3, repeat('a', 2000)) $$,
  'a 2,000-character mood note is accepted');
select throws_ok(
  $$ insert into public.mood_logs (user_id, mood_score, note) values (auth.uid(), 3, repeat('a', 2001)) $$,
  '23514', null, 'a 2,001-character mood note is refused');

select lives_ok(
  $$ insert into public.thought_records (user_id, situation, automatic_thought, emotion, emotion_intensity,
       evidence_for, evidence_against, balanced_thought)
     values (auth.uid(), repeat('s', 2000), repeat('t', 2000), repeat('e', 60), 5,
       repeat('f', 4000), repeat('g', 4000), repeat('b', 2000)) $$,
  'a thought record with every field exactly at its limit is accepted');
select throws_ok(
  $$ insert into public.thought_records (user_id, situation, automatic_thought, emotion, emotion_intensity)
     values (auth.uid(), repeat('s', 2001), 't', 'e', 5) $$,
  '23514', null, 'situation over 2,000 is refused');
select throws_ok(
  $$ insert into public.thought_records (user_id, situation, automatic_thought, emotion, emotion_intensity)
     values (auth.uid(), 's', repeat('t', 2001), 'e', 5) $$,
  '23514', null, 'automatic_thought over 2,000 is refused');
select throws_ok(
  $$ insert into public.thought_records (user_id, situation, automatic_thought, emotion, emotion_intensity)
     values (auth.uid(), 's', 't', repeat('e', 61), 5) $$,
  '23514', null, 'emotion over 60 is refused');
select throws_ok(
  $$ insert into public.thought_records (user_id, situation, automatic_thought, emotion, emotion_intensity, evidence_for)
     values (auth.uid(), 's', 't', 'e', 5, repeat('f', 4001)) $$,
  '23514', null, 'evidence_for over 4,000 is refused');
select throws_ok(
  $$ insert into public.thought_records (user_id, situation, automatic_thought, emotion, emotion_intensity, evidence_against)
     values (auth.uid(), 's', 't', 'e', 5, repeat('g', 4001)) $$,
  '23514', null, 'evidence_against over 4,000 is refused');
select throws_ok(
  $$ insert into public.thought_records (user_id, situation, automatic_thought, emotion, emotion_intensity, balanced_thought)
     values (auth.uid(), 's', 't', 'e', 5, repeat('b', 2001)) $$,
  '23514', null, 'balanced_thought over 2,000 is refused');

select lives_ok(
  $$ insert into public.habits (user_id, name) values (auth.uid(), repeat('h', 80)) $$,
  'an 80-character habit name is accepted');
select throws_ok(
  $$ insert into public.habits (user_id, name) values (auth.uid(), repeat('h', 81)) $$,
  '23514', null, 'an 81-character habit name is refused');

select throws_ok(
  $$ update public.mood_logs set note = repeat('a', 2001) where user_id = auth.uid() $$,
  '23514', null, 'an existing row cannot be edited past the limit either');

select throws_ok(
  $$ update public.profiles set first_utm_source = 'x' where id = auth.uid() $$,
  '42501', null, 'a student can no longer update their own UTM fields');
select lives_ok(
  $$ update public.profiles set display_name = 'Still editable' where id = auth.uid() $$,
  'but display_name is still theirs to change');

reset role;
select throws_ok(
  $$ insert into public.profiles (id, first_utm_source) values ('d1d1d1d1-0000-0000-0000-00000000ffff', repeat('u', 201)) $$,
  '23514', null, 'a UTM value over 200 is refused even for the server');
select throws_ok(
  $$ insert into public.classes (name, join_code, owner_id) values ('x', 'not-a-code', 'd1d1d1d1-0000-0000-0000-000000000001') $$,
  '23514', null, 'a join code must be ten upper-case hex characters');
select throws_ok(
  $$ insert into public.role_change_audit (target_user_id, previous_role, new_role, changed_by, reason)
     values ('d1d1d1d1-0000-0000-0000-000000000001', 'student', 'teacher', 'd1d1d1d1-0000-0000-0000-000000000002', repeat('r', 501)) $$,
  '23514', null, 'an audit reason over 500 is refused');

select is(
  (select count(*)::int from pg_constraint
   where conname in ('mood_logs_note_length', 'thought_records_situation_length', 'habits_name_length',
                     'profiles_first_utm_source_length', 'classes_join_code_format')
     and convalidated),
  5,
  'on a database with no oversized rows, every constraint ends up validated'
);


-- ---------------------------------------------------------------------------
-- created_at belongs to the server
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"d1d1d1d1-0000-0000-0000-000000000001","role":"authenticated"}';

insert into public.mood_logs (user_id, mood_score, created_at) values (auth.uid(), 1, '2019-01-01T00:00:00Z');
select ok(
  (select max(created_at) > now() - interval '1 minute' from public.mood_logs where mood_score = 1),
  'a mood sent with created_at 2019 is stamped with the server''s time instead'
);

update public.mood_logs set created_at = '2019-01-01T00:00:00Z' where mood_score = 1;
select ok(
  (select min(created_at) > now() - interval '1 minute' from public.mood_logs where mood_score = 1),
  'and cannot be re-dated afterwards'
);

reset role;
insert into public.mood_logs (user_id, mood_score, created_at) values (:'other'::uuid, 2, '2020-06-01T00:00:00Z');
select is(
  (select created_at from public.mood_logs where user_id = :'other'::uuid),
  '2020-06-01T00:00:00Z'::timestamptz,
  'the server itself (migrations, tests, the SQL Editor) may still set a date deliberately'
);
delete from public.mood_logs where user_id = :'other'::uuid;


-- ---------------------------------------------------------------------------
-- Daily quotas
-- ---------------------------------------------------------------------------

-- Moods: the writer has 2 so far (the 2,000-character note and the re-dated one).
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1d1d1d1-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.mood_logs), 2, 'the writer starts with two moods today');

select lives_ok(
  $$ insert into public.mood_logs (user_id, mood_score) select auth.uid(), 3 from generate_series(1, 48) $$,
  'up to fifty moods in 24 hours are accepted');
select throws_ok(
  $$ insert into public.mood_logs (user_id, mood_score) values (auth.uid(), 3) $$,
  'PT429', null, 'the fifty-first is refused with PT429 (HTTP 429)');

set local request.jwt.claims to '{"sub":"d1d1d1d1-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ insert into public.mood_logs (user_id, mood_score) select auth.uid(), 3 from generate_series(1, 5000) $$,
  'PT429', null, 'five thousand rows in one request are refused as a whole');
select is((select count(*)::int from public.mood_logs), 0, 'and none of them were kept');
select lives_ok(
  $$ insert into public.mood_logs (user_id, mood_score) values (auth.uid(), 4) $$,
  'another student''s quota is their own');

reset role;
update public.mood_logs set created_at = now() - interval '25 hours' where user_id = :'writer'::uuid;
set local role authenticated;
set local request.jwt.claims to '{"sub":"d1d1d1d1-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ insert into public.mood_logs (user_id, mood_score) values (auth.uid(), 3) $$,
  'rows older than 24 hours do not count');

-- Thought records: 25. The writer has 1 (the at-limit record).
select lives_ok(
  $$ insert into public.thought_records (user_id, situation, automatic_thought, emotion, emotion_intensity)
     select auth.uid(), 's', 't', 'e', 5 from generate_series(1, 24) $$,
  'up to twenty-five thought records in 24 hours are accepted');
select throws_ok(
  $$ insert into public.thought_records (user_id, situation, automatic_thought, emotion, emotion_intensity)
     values (auth.uid(), 's', 't', 'e', 5) $$,
  'PT429', null, 'the twenty-sixth is refused');

-- Habits: 20 new a day. The writer has 2 (Walk was made by the server "now",
-- so it counts, and the 80-character one).
select lives_ok(
  $$ insert into public.habits (user_id, name) select auth.uid(), 'h' || g from generate_series(1, 18) g $$,
  'up to twenty new habits in 24 hours are accepted');
select throws_ok(
  $$ insert into public.habits (user_id, name) values (auth.uid(), 'one more') $$,
  'PT429', null, 'the twenty-first is refused');

-- Habit ticks: 300. One per habit per day, so tick across many days.
select lives_ok(
  $$ insert into public.habit_logs (user_id, habit_id, date)
     select auth.uid(), 'd1d1d1d1-0000-0000-0000-00000000aaaa', current_date - g from generate_series(0, 299) g $$,
  'up to three hundred ticks in 24 hours are accepted');
select throws_ok(
  $$ insert into public.habit_logs (user_id, habit_id, date)
     values (auth.uid(), 'd1d1d1d1-0000-0000-0000-00000000aaaa', current_date - 300) $$,
  'PT429', null, 'the three hundred and first is refused');

reset role;
select lives_ok(
  $$ insert into public.mood_logs (user_id, mood_score) select 'd1d1d1d1-0000-0000-0000-000000000001', 3 from generate_series(1, 100) $$,
  'the quota applies to the API roles, not to the server');

select is(
  (select count(*)::int from pg_trigger where tgname like '%_daily_quota' and not tgisinternal),
  4,
  'all four journal tables carry a quota trigger'
);

select * from finish();
rollback;

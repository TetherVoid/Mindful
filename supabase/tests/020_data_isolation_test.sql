-- One student's journal is not readable by another, by any route.
--
-- This is the oldest guarantee in the app and the one the roles work was most
-- likely to break, so it is tested against the post-upgrade schema rather than
-- assumed to have survived.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\set student_a '11111111-1111-1111-1111-111111111111'
\set student_b '22222222-2222-2222-2222-222222222222'

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

select tests_make_user(:'student_a'::uuid, 'iso-a@example.com');
select tests_make_user(:'student_b'::uuid, 'iso-b@example.com');

create temporary table t_habits (label text primary key, id uuid) on commit drop;
-- The temp table is owned by the session user; the tests below write to it
-- while switched to `authenticated`, which otherwise holds nothing on it.
grant all on t_habits to authenticated;

-- Seed each student's own journal, as themselves, through the same policies the
-- app writes through.
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
insert into public.mood_logs (user_id, mood_score, note)
  values (auth.uid(), 4, 'A private note from A');
insert into public.thought_records (user_id, situation, automatic_thought)
  values (auth.uid(), 'A situation', 'A thought');
insert into public.habits (user_id, name) values (auth.uid(), 'A habit');
insert into t_habits select 'a', id from public.habits where user_id = auth.uid();

set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
insert into public.mood_logs (user_id, mood_score, note)
  values (auth.uid(), 2, 'A private note from B');
insert into public.thought_records (user_id, situation, automatic_thought)
  values (auth.uid(), 'B situation', 'B thought');
insert into public.habits (user_id, name) values (auth.uid(), 'B habit');
insert into t_habits select 'b', id from public.habits where user_id = auth.uid();


-- ---------------------------------------------------------------------------
-- A sees only A
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.mood_logs), 1,
  'student A sees exactly one mood log');
select is((select note from public.mood_logs), 'A private note from A',
  'and it is their own, not B''s');
select is((select count(*)::int from public.thought_records), 1,
  'student A sees exactly one thought record');
select is((select situation from public.thought_records), 'A situation',
  'and it is their own');

-- Naming B's id explicitly is the interesting case: RLS has to filter it out,
-- not merely default to the caller.
select is(
  (select count(*)::int from public.mood_logs
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  0,
  'asking for B''s mood logs by user_id returns nothing'
);
select is(
  (select count(*)::int from public.thought_records
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  0,
  'asking for B''s thought records by user_id returns nothing'
);
select is(
  (select count(*)::int from public.habits
   where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  0,
  'asking for B''s habits by user_id returns nothing'
);

-- A cannot write into B's journal either.
select throws_ok(
  $$ insert into public.mood_logs (user_id, mood_score)
     values ('22222222-2222-2222-2222-222222222222'::uuid, 5) $$,
  '42501',
  null,
  'student A cannot file a mood log under B''s user_id'
);

-- The habit_logs hole: a tick whose user_id is mine but whose habit is yours.
-- Before 20260911000500 this row was accepted.
select throws_ok(
  format($$ insert into public.habit_logs (habit_id, user_id, date)
            values (%L::uuid, auth.uid(), current_date) $$,
         (select id from t_habits where label = 'b')),
  '42501',
  null,
  'student A cannot tick a habit belonging to B'
);

select lives_ok(
  format($$ insert into public.habit_logs (habit_id, user_id, date)
            values (%L::uuid, auth.uid(), current_date) $$,
         (select id from t_habits where label = 'a')),
  'but can tick their own'
);

-- A student is not a teacher and holds no class, so the figures functions must
-- refuse them even about a real user.
select throws_ok(
  $$ select * from public.student_overview('22222222-2222-2222-2222-222222222222'::uuid) $$,
  '42501',
  null,
  'student A cannot pull B''s figures through student_overview()'
);

select throws_ok(
  $$ select * from public.student_mood_series('22222222-2222-2222-2222-222222222222'::uuid) $$,
  '42501',
  null,
  'nor through student_mood_series()'
);

select lives_ok(
  $$ select * from public.student_overview(auth.uid()) $$,
  'though they can pull their own'
);

reset role;
set local request.jwt.claims to '';

select * from finish();
rollback;

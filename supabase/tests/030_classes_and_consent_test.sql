-- Classes: who may enrol, who may see a roster, and what a teacher gets.
--
-- The shape under test is that a teacher's access needs three separate facts to
-- hold at once — the teacher role, a live class the student is in, and that
-- student's consent — and that removing any one of them closes the door.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

\set teacher       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set other_teacher 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set consenting    'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set private       'dddddddd-dddd-dddd-dddd-dddddddddddd'
\set outsider      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'

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

select tests_make_user(:'teacher'::uuid, 't1@example.com');
select tests_make_user(:'other_teacher'::uuid, 't2@example.com');
select tests_make_user(:'consenting'::uuid, 's-yes@example.com');
select tests_make_user(:'private'::uuid, 's-no@example.com');
select tests_make_user(:'outsider'::uuid, 's-out@example.com');

-- Promote the two teachers through the sanctioned back door, as the runbook
-- does for the first administrator.
select set_config('mindful.privileged_write', 'on', true);
update public.profiles set role = 'teacher'
  where id in (:'teacher'::uuid, :'other_teacher'::uuid);
select set_config('mindful.privileged_write', 'off', true);

create temporary table t_class (label text primary key, id uuid, code text) on commit drop;
-- Owned by the session user; written and read below as `authenticated`.
grant all on t_class to authenticated;


-- ---------------------------------------------------------------------------
-- Only a teacher may create a class
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

select throws_ok(
  $$ select public.create_class('A student''s class') $$,
  '42501',
  null,
  'a student cannot create a class'
);

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select lives_ok(
  $$ select public.create_class('Year 9 form group') $$,
  'a teacher can create a class'
);

insert into t_class
  select 'main', c.id, c.join_code from public.classes c where c.name = 'Year 9 form group';

select isnt((select code from t_class where label = 'main'), null::text,
  'and the class comes back with a server-generated join code');


-- ---------------------------------------------------------------------------
-- Enrolment needs a valid code
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

select throws_ok(
  $$ select public.join_class('NOTACODE00') $$,
  'P0002',
  null,
  'a student cannot join with a code that matches no class'
);

-- Guessing the class id instead of the code must not work either: there is no
-- INSERT policy on class_members for students.
select throws_ok(
  format($$ insert into public.class_members (class_id, user_id)
            values (%L::uuid, auth.uid()) $$,
         (select id from t_class where label = 'main')),
  '42501',
  null,
  'nor by inserting themselves into class_members directly'
);

select lives_ok(
  format($$ select public.join_class(%L) $$, (select code from t_class where label = 'main')),
  'but can join with the real code'
);

-- Consent is the student's own to give, through a column they do hold UPDATE on.
update public.profiles set share_with_teachers = true where id = auth.uid();
select is((select share_with_teachers from public.profiles where id = auth.uid()), true,
  'and can opt in to teacher visibility themselves');

set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';

select lives_ok(
  format($$ select public.join_class(%L) $$, (select code from t_class where label = 'main')),
  'a second student joins the same class'
);
select is((select share_with_teachers from public.profiles where id = auth.uid()), false,
  'and stays private by default');


-- ---------------------------------------------------------------------------
-- What the class's teacher sees
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select count(*)::int from public.class_roster((select id from t_class where label = 'main'))),
  2,
  'the roster names both enrolled students'
);

select is(
  (select count(*)::int from public.class_overview((select id from t_class where label = 'main'))),
  1,
  'but the overview carries figures for only the one who consented'
);

select is(
  (select co.user_id from public.class_overview((select id from t_class where label = 'main')) co),
  :'consenting'::uuid,
  'and it is the consenting student'
);

select is(
  public.may_view_student(:'consenting'::uuid),
  true,
  'may_view_student agrees for the consenting student'
);

select is(
  public.may_view_student(:'private'::uuid),
  false,
  'and refuses for the private one'
);

select throws_ok(
  $$ select * from public.student_overview('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid) $$,
  '42501',
  null,
  'so the private student''s figures are unreachable even by name'
);

-- Archiving ends the relationship, and with it the access.
update public.classes set archived = true where id = (select id from t_class where label = 'main');
select is(
  public.may_view_student(:'consenting'::uuid),
  false,
  'archiving the class ends the teacher''s access to its students'
);
update public.classes set archived = false where id = (select id from t_class where label = 'main');


-- ---------------------------------------------------------------------------
-- A teacher of another class sees nothing here
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}';

select is(
  public.may_view_student(:'consenting'::uuid),
  false,
  'a teacher who does not teach this class cannot view its students'
);

select throws_ok(
  format($$ select * from public.class_roster(%L::uuid) $$,
         (select id from t_class where label = 'main')),
  '42501',
  null,
  'and cannot read its roster'
);


-- ---------------------------------------------------------------------------
-- A student outside the class
-- ---------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}';

select is(
  (select count(*)::int from public.class_members
   where class_id = (select id from t_class where label = 'main')),
  0,
  'a student not in the class sees none of its membership rows'
);

select is(
  (select count(*)::int from public.classes
   where id = (select id from t_class where label = 'main')),
  0,
  'and cannot read the class row itself, join code included'
);

reset role;
set local request.jwt.claims to '';

select * from finish();
rollback;

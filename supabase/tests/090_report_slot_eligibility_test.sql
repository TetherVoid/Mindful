-- Migration 20260927000200: an AI reading needs a confirmed account that is at
-- least a day old. Before it, a brand-new or unconfirmed account got 'ok'.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\set seasoned 'e1e1e1e1-0000-0000-0000-000000000001'
\set fresh    'e1e1e1e1-0000-0000-0000-000000000002'
\set unsure   'e1e1e1e1-0000-0000-0000-000000000003'
\set edge     'e1e1e1e1-0000-0000-0000-000000000004'

create or replace function tests_make_user(p_id uuid, p_email text, p_age interval, p_confirmed boolean)
returns uuid language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, 'x', case when p_confirmed then now() - p_age else null end, now() - p_age, now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', ''
  );
  return p_id;
end;
$$;

select tests_make_user(:'seasoned'::uuid, 'r-seasoned@example.com', interval '25 hours', true);
select tests_make_user(:'fresh'::uuid,    'r-fresh@example.com',    interval '1 hour',   true);
select tests_make_user(:'unsure'::uuid,   'r-unsure@example.com',   interval '3 days',   false);
select tests_make_user(:'edge'::uuid,     'r-edge@example.com',     interval '23 hours 59 minutes', true);

set local role authenticated;

set local request.jwt.claims to '{"sub":"e1e1e1e1-0000-0000-0000-000000000001","role":"authenticated"}';
select is(public.claim_report_slot(), 'ok', 'a confirmed account over a day old gets a reading');

set local request.jwt.claims to '{"sub":"e1e1e1e1-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.claim_report_slot(), 'account_too_new', 'an account an hour old does not');

set local request.jwt.claims to '{"sub":"e1e1e1e1-0000-0000-0000-000000000004","role":"authenticated"}';
select is(public.claim_report_slot(), 'account_too_new', 'nor does one a minute short of a day');

set local request.jwt.claims to '{"sub":"e1e1e1e1-0000-0000-0000-000000000003","role":"authenticated"}';
select is(public.claim_report_slot(), 'unconfirmed', 'an unconfirmed account does not, however old');

reset role;
select is(
  (select count(*)::int from public.report_requests
   where user_id in (:'fresh'::uuid, :'unsure'::uuid, :'edge'::uuid)),
  0,
  'a refused claim records nothing, so it spends nothing'
);
select is(
  (select count(*)::int from public.report_requests where user_id = :'seasoned'::uuid),
  1,
  'the granted one is on record'
);

-- A day later the new account is eligible.
update auth.users set created_at = now() - interval '25 hours' where id = :'fresh'::uuid;
set local role authenticated;
set local request.jwt.claims to '{"sub":"e1e1e1e1-0000-0000-0000-000000000002","role":"authenticated"}';
select is(public.claim_report_slot(), 'ok', 'once the account is a day old, it gets a reading');

reset role;
select ok(
  not has_function_privilege('anon', 'public.claim_report_slot()', 'EXECUTE'),
  'and the function is still closed to anonymous callers'
);

select * from finish();
rollback;

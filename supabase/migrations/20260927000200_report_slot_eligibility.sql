-- AI readings only for confirmed accounts at least a day old.
--
-- claim_report_slot() allows 3 readings per student and 300 per deployment in
-- any 24 hours. Before this migration a brand-new account could take its three
-- at once, so a hundred throwaway sign-ups could spend the whole deployment's
-- allowance and leave every real student with "limit reached" for a day.
--
-- Two checks now come before any slot is counted:
--   * the account's email address is confirmed ('unconfirmed' otherwise). With
--     "Confirm email" on, an unconfirmed account cannot sign in at all, so this
--     is the second barrier — it keeps holding if that setting is ever turned
--     off;
--   * the account is at least 24 hours old ('account_too_new' otherwise). Mass
--     sign-ups now have to wait a day before they can spend anything, which
--     leaves a day to notice them.
--
-- A refused check records nothing, like the existing refusals. Everything else
-- — the per-student and per-deployment limits, the advisory lock, pruning,
-- failing for deactivated accounts — is unchanged from 20260926000100.

create or replace function public.claim_report_slot()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_per_student constant integer := 3;
  v_per_deployment constant integer := 300;
  v_window constant interval := interval '24 hours';
  v_min_age constant interval := interval '24 hours';
  v_confirmed timestamptz;
  v_created timestamptz;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = v_uid and p.deactivated_at is null
  ) then
    raise exception 'account is not active' using errcode = '42501';
  end if;

  select u.email_confirmed_at, u.created_at into v_confirmed, v_created
  from auth.users u where u.id = v_uid;

  if v_confirmed is null then
    return 'unconfirmed';
  end if;
  if v_created is null or v_created > now() - v_min_age then
    return 'account_too_new';
  end if;

  -- One claim at a time, so two requests cannot both take the last slot.
  perform pg_advisory_xact_lock(hashtext('mindful.report_requests'));

  delete from public.report_requests where created_at < now() - interval '48 hours';

  if (select count(*) from public.report_requests
      where user_id = v_uid and created_at > now() - v_window) >= v_per_student then
    return 'user_limit';
  end if;

  if (select count(*) from public.report_requests
      where created_at > now() - v_window) >= v_per_deployment then
    return 'global_limit';
  end if;

  insert into public.report_requests (user_id) values (v_uid);
  return 'ok';
end;
$$;

revoke execute on function public.claim_report_slot() from public, anon;
grant execute on function public.claim_report_slot() to authenticated;

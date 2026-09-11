-- Letting someone switch their own account off.
--
-- Until now `deactivated_at` moved only through `set_account_active()`, which is
-- administrator-only. That leaves a person who wants to stop using Mindful with
-- two options: delete everything, or keep an active account. This adds the third
-- and mildest one, and it is deliberately one-way.
--
-- The shape of the function is the security argument, so it is worth stating
-- plainly rather than relying on the body being read carefully:
--
--   * IT TAKES NO ARGUMENTS. There is no user id in the signature and none in
--     the body except `auth.uid()`. A caller cannot name somebody else because
--     the function gives them nowhere to write a name. This is stronger than
--     taking an id and checking it matches — a check can be edited out later by
--     someone who does not see why it is there; a missing parameter cannot.
--   * IT ONLY EVER SETS. `deactivated_at` is written to `now()` and never to
--     null, so this is not a toggle and cannot be used to undo a suspension an
--     administrator applied. Reactivation stays with `set_account_active()`,
--     which requires `is_admin()` — and a deactivated account fails `is_admin()`
--     regardless of its role, so a suspended administrator cannot lift their own
--     suspension either.
--   * IT DOES NOT TOUCH `role`. The UPDATE names one column.
--
-- It passes `guard_profile_privileges` the same legitimate way the other
-- privileged functions do: SECURITY DEFINER makes `current_user` the owner
-- rather than `authenticated`, which is the condition under which the guard
-- trusts the `mindful.privileged_write` flag. Identity is unaffected by that —
-- `auth.uid()` reads the JWT claims GUC, which SECURITY DEFINER does not change
-- — so the row being deactivated is still the caller's own.

create or replace function public.deactivate_my_account()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  affected integer;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  perform set_config('mindful.privileged_write', 'on', true);
  update public.profiles
    set deactivated_at = now()
    where id = me
      and deactivated_at is null;
  get diagnostics affected = row_count;
  perform set_config('mindful.privileged_write', 'off', true);

  -- Same tidy-up as set_account_active(): a suspended student should stop
  -- appearing on a roster rather than sit there greyed out. Scoped to `me` for
  -- the same reason the UPDATE is.
  delete from public.class_members where user_id = me;
  delete from public.class_teachers where user_id = me;

  -- True when this call is what deactivated them; false when they already were.
  -- Either way the account ends up deactivated, which is what the caller asked
  -- for, so this is information rather than a failure.
  return affected > 0;
end;
$$;

revoke execute on function public.deactivate_my_account() from public, anon;
grant execute on function public.deactivate_my_account() to authenticated;

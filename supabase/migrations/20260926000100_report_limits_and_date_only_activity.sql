-- Phase B: a persistent limit on AI readings, and no times of day in teacher
-- overviews.
--
-- Part 1 — last_mood_at and last_activity_at become dates.
--
--   class_overview() and student_overview() returned the exact moment a
--   student last logged a mood and last did anything at all. A teacher does
--   not need to know that a child was writing at 2am; the day is enough, and
--   the day is all student_mood_series() has returned since 20260925000100.
--   The column NAMES are kept so a frontend already deployed keeps reading
--   them; only their type changes, from timestamptz to date. Both functions are
--   otherwise exactly as 20260925000100 left them: consent is still decided by
--   may_view_student() for every row.
--
-- Part 2 — report_requests and claim_report_slot().
--
--   /api/report calls a paid model. Its in-memory limiter resets on every cold
--   start and is not shared between instances, so it is a speed bump, not a
--   billing control. This adds the billing control: a table of when each
--   reading was requested, and one function that decides — under a lock, so
--   two requests cannot both take the last slot — whether another is allowed.
--
--     3 readings per student per rolling 24 hours
--     300 readings across the whole deployment per rolling 24 hours
--
--   The function takes no arguments: the caller is auth.uid() and nothing
--   else, the same structural safety as deactivate_my_account(). The table
--   holds a user id and a timestamp and nothing more, is pruned to the last 48
--   hours on every claim, and is deleted with the account. No role can read or
--   write it directly.

-- ===========================================================================
-- Part 1: dates, not times, in the overviews
-- ===========================================================================

-- The return types change, which CREATE OR REPLACE cannot do, so both are
-- dropped and recreated and their grants restated at the end.
drop function if exists public.class_overview(uuid, integer);
drop function if exists public.student_overview(uuid, integer);

create function public.student_overview(p_student_id uuid, p_days integer default 30)
returns table (
  user_id uuid,
  display_name text,
  mood_entries integer,
  average_mood numeric,
  last_mood_at date,
  active_habits integer,
  habit_ticks integer,
  thought_record_count integer,
  last_activity_at date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not public.may_view_student(p_student_id) then
    raise exception 'not authorised for this student' using errcode = '42501';
  end if;

  return query
    select
      p_student_id,
      (select pr.display_name from public.profiles pr where pr.id = p_student_id),
      (select count(*)::integer from public.mood_logs m
        where m.user_id = p_student_id and m.created_at >= since),
      (select round(avg(m.mood_score), 2) from public.mood_logs m
        where m.user_id = p_student_id and m.created_at >= since),
      (select max(m.created_at)::date from public.mood_logs m where m.user_id = p_student_id),
      (select count(*)::integer from public.habits h
        where h.user_id = p_student_id and h.archived = false),
      (select count(*)::integer from public.habit_logs hl
        where hl.user_id = p_student_id and hl.date >= since::date),
      (select count(*)::integer from public.thought_records t
        where t.user_id = p_student_id and t.created_at >= since),
      greatest(
        (select max(m.created_at) from public.mood_logs m where m.user_id = p_student_id),
        (select max(hl.created_at) from public.habit_logs hl where hl.user_id = p_student_id),
        (select max(t.created_at) from public.thought_records t where t.user_id = p_student_id)
      )::date;
end;
$$;

create function public.class_overview(p_class_id uuid, p_days integer default 30)
returns table (
  user_id uuid,
  display_name text,
  mood_entries integer,
  average_mood numeric,
  last_mood_at date,
  active_habits integer,
  habit_ticks integer,
  thought_record_count integer,
  last_activity_at date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not (public.is_class_teacher(p_class_id) or public.is_admin()) then
    raise exception 'not authorised for this class' using errcode = '42501';
  end if;

  return query
    select
      cm.user_id,
      p.display_name,
      (select count(*)::integer from public.mood_logs m
        where m.user_id = cm.user_id and m.created_at >= since),
      (select round(avg(m.mood_score), 2) from public.mood_logs m
        where m.user_id = cm.user_id and m.created_at >= since),
      (select max(m.created_at)::date from public.mood_logs m where m.user_id = cm.user_id),
      (select count(*)::integer from public.habits h
        where h.user_id = cm.user_id and h.archived = false),
      (select count(*)::integer from public.habit_logs hl
        where hl.user_id = cm.user_id and hl.date >= since::date),
      (select count(*)::integer from public.thought_records t
        where t.user_id = cm.user_id and t.created_at >= since),
      greatest(
        (select max(m.created_at) from public.mood_logs m where m.user_id = cm.user_id),
        (select max(hl.created_at) from public.habit_logs hl where hl.user_id = cm.user_id),
        (select max(t.created_at) from public.thought_records t where t.user_id = cm.user_id)
      )::date
    from public.class_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.class_id = p_class_id
      and p.deactivated_at is null
      and public.may_view_student(cm.user_id)
    order by coalesce(p.display_name, '') asc;
end;
$$;

revoke execute on function
  public.student_overview(uuid, integer),
  public.class_overview(uuid, integer)
from public, anon;

grant execute on function
  public.student_overview(uuid, integer),
  public.class_overview(uuid, integer)
to authenticated;

-- ===========================================================================
-- Part 2: the reading limit
-- ===========================================================================

create table if not exists public.report_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists report_requests_created_at_idx
  on public.report_requests (created_at);
create index if not exists report_requests_user_created_idx
  on public.report_requests (user_id, created_at);

-- RLS on and no policies at all: nobody reads or writes this table except
-- through claim_report_slot(), which runs as its owner. The revoke is the
-- belt to that brace — the grant system refuses before any policy is asked.
alter table public.report_requests enable row level security;
revoke all on public.report_requests from public, anon, authenticated;

create or replace function public.claim_report_slot()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  -- The limits. Changing them is a new migration, on purpose: a spending
  -- ceiling should be reviewed, not edited in place.
  v_per_student constant integer := 3;
  v_per_deployment constant integer := 300;
  v_window constant interval := interval '24 hours';
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p where p.id = v_uid and p.deactivated_at is null
  ) then
    raise exception 'account is not active' using errcode = '42501';
  end if;

  -- One lock for every claim, held to the end of this transaction, so two
  -- concurrent requests cannot both see room for the last slot. A claim is a
  -- few index lookups; serialising them costs nothing at this scale.
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

-- Upgrade 3 of 4: what a teacher and an administrator can actually read.
--
-- Neither role gets any table-level access to mood_logs, habits, habit_logs or
-- thought_records. The previous migration added no policy to those four tables
-- and this one adds none either. Teachers read through the functions below, and
-- these functions return counts, scores and dates.
--
-- No function here selects mood_logs.note, thought_records.situation,
-- thought_records.automatic_thought, or any other free-text column. That is not
-- a filter applied on the way out that a later edit might forget — those
-- columns are never named in this file, and there is no policy that would let
-- them be read directly.
--
-- Every function checks authorisation itself and raises 42501 rather than
-- returning an empty set, so a caller can tell "you may not" from "there is
-- nothing". All are revoked from anon.

create or replace function public.class_roster(p_class_id uuid)
returns table (
  user_id uuid,
  display_name text,
  share_with_teachers boolean,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.is_class_teacher(p_class_id) or public.is_admin()) then
    raise exception 'not authorised for this class' using errcode = '42501';
  end if;

  return query
    select cm.user_id, p.display_name, p.share_with_teachers, cm.created_at
    from public.class_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.class_id = p_class_id
      and p.deactivated_at is null
    order by coalesce(p.display_name, '') asc, cm.created_at asc;
end;
$$;

-- Figures for one student. Goes through may_view_student(), so a student
-- calling it about themselves gets their own numbers and a teacher gets nothing
-- unless all three conditions hold.
--
-- `p_days` is clamped to 1..365 rather than trusted: it arrives from the
-- browser and feeds an interval.
create or replace function public.student_overview(p_student_id uuid, p_days integer default 30)
returns table (
  user_id uuid,
  display_name text,
  mood_entries integer,
  average_mood numeric,
  last_mood_at timestamptz,
  active_habits integer,
  habit_ticks integer,
  thought_record_count integer,
  last_activity_at timestamptz
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
      (select max(m.created_at) from public.mood_logs m where m.user_id = p_student_id),
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
      );
end;
$$;

-- The same figures for a whole class, one row per student, so a teacher's
-- overview is one round trip rather than one per child.
--
-- Students who have not opted in are absent from the result rather than shown
-- empty: a row of zeroes reads as "this child has stopped writing", which is
-- not what it means.
create or replace function public.class_overview(p_class_id uuid, p_days integer default 30)
returns table (
  user_id uuid,
  display_name text,
  mood_entries integer,
  average_mood numeric,
  last_mood_at timestamptz,
  active_habits integer,
  habit_ticks integer,
  thought_record_count integer,
  last_activity_at timestamptz
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
      (select max(m.created_at) from public.mood_logs m where m.user_id = cm.user_id),
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
      )
    from public.class_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.class_id = p_class_id
      and p.deactivated_at is null
      and (p.share_with_teachers or public.is_admin())
    order by coalesce(p.display_name, '') asc;
end;
$$;

-- A mood series with the notes left behind: the day and the score, nothing
-- else. Enough to draw the same line the student sees, without reading a word
-- they wrote.
create or replace function public.student_mood_series(p_student_id uuid, p_days integer default 30)
returns table (day date, mood_score smallint, logged_at timestamptz)
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
    select m.created_at::date, m.mood_score, m.created_at
    from public.mood_logs m
    where m.user_id = p_student_id and m.created_at >= since
    order by m.created_at asc;
end;
$$;

create or replace function public.student_habit_summary(p_student_id uuid, p_days integer default 30)
returns table (habit_id uuid, name text, ticks integer, last_tick date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  since date := (now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))))::date;
begin
  if not public.may_view_student(p_student_id) then
    raise exception 'not authorised for this student' using errcode = '42501';
  end if;

  return query
    select h.id, h.name, count(hl.habit_id)::integer, max(hl.date)
    from public.habits h
    left join public.habit_logs hl on hl.habit_id = h.id and hl.date >= since
    where h.user_id = p_student_id and h.archived = false
    group by h.id, h.name
    order by h.name asc;
end;
$$;

revoke execute on function
  public.class_roster(uuid),
  public.student_overview(uuid, integer),
  public.class_overview(uuid, integer),
  public.student_mood_series(uuid, integer),
  public.student_habit_summary(uuid, integer)
from public, anon;

grant execute on function
  public.class_roster(uuid),
  public.student_overview(uuid, integer),
  public.class_overview(uuid, integer),
  public.student_mood_series(uuid, integer),
  public.student_habit_summary(uuid, integer)
to authenticated;

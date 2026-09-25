-- Consent governs every read of a student's figures, administrators included.
--
-- Until now an administrator passed may_view_student() for every student,
-- whether or not that student had switched on share_with_teachers, and
-- class_overview() showed administrators the figures of students who had kept
-- them private. This migration makes consent the rule for everyone who is not
-- the student:
--
--   teacher         teaches a live class the student is in, AND the student
--                   has opted in                                  (unchanged)
--   administrator   the student is in at least one live class, AND the
--                   student has opted in                              (new)
--
-- An administrator still administers — roles, suspension, every class, the
-- roster of who is enrolled — through the functions and policies that already
-- exist. What they lose is any view of how a student is doing without that
-- student's say-so. "Share figures with teachers" is the only consent a student
-- gives, so it is the only thing that opens the door.
--
-- Two of the read functions also hand over less:
--
--   student_mood_series     no longer returns logged_at. The day and the score
--                           are enough to draw the student's line; the time of
--                           day a child writes (at 2am, say) is behavioural
--                           detail no reader of figures needs.
--   student_habit_summary   no longer returns habit names or ids. A habit name
--                           is free text the student typed, and free text is
--                           never shown to anyone but its author. Habits come
--                           back numbered in the order they were created.
--
-- And one inconsistency is closed on the way through: class_overview() checked
-- that the caller teaches the class but not that the class is live, so the
-- teacher of an ARCHIVED class kept seeing its students' figures. SECURITY.md
-- has always said archiving ends access, and may_view_student() has always
-- enforced it. class_overview() now asks may_view_student() about each student,
-- so there is one rule for figure access instead of two.

-- ---------------------------------------------------------------------------
-- The one authority on "may this caller see this student's figures"
-- ---------------------------------------------------------------------------

create or replace function public.may_view_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    case
      when auth.uid() is null then false
      when p_student_id = auth.uid() then true
      -- Not opted in: nobody else may look, whatever their role. Checked
      -- before any role test so that no later branch can forget it.
      when not coalesce(
        (select p.share_with_teachers from public.profiles p where p.id = p_student_id),
        false
      ) then false
      -- is_teacher() is true for administrators too, so an administrator who
      -- teaches the student's class is answered here, exactly as a teacher is.
      when public.is_teacher() and public.teaches_student(p_student_id) then true
      when public.is_admin() then exists (
        select 1
        from public.class_members cm
        join public.classes c on c.id = cm.class_id
        where cm.user_id = p_student_id
          and c.archived = false
      )
      else false
    end;
$$;

-- ---------------------------------------------------------------------------
-- A class's figures, filtered by the same rule
-- ---------------------------------------------------------------------------

-- Who may call it is unchanged: the class's teachers and administrators. Whose
-- figures come back is now decided per student by may_view_student(), so an
-- administrator sees only students who opted in, and a teacher of an archived
-- class sees none. Students without access are absent rather than zeroed — a
-- row of zeroes reads as "this child has stopped writing".
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
      and public.may_view_student(cm.user_id)
    order by coalesce(p.display_name, '') asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mood series: day and score, no time of day
-- ---------------------------------------------------------------------------

-- The return type changes, which CREATE OR REPLACE cannot do, so the function
-- is dropped and recreated. Its grants go with it and are restated below.
drop function if exists public.student_mood_series(uuid, integer);

create function public.student_mood_series(p_student_id uuid, p_days integer default 30)
returns table (day date, mood_score smallint)
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

  -- Ordered by the timestamp so entries within a day keep their sequence; the
  -- timestamp itself stays in the database.
  return query
    select m.created_at::date, m.mood_score
    from public.mood_logs m
    where m.user_id = p_student_id and m.created_at >= since
    order by m.created_at asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Habit summary: counts, no names
-- ---------------------------------------------------------------------------

drop function if exists public.student_habit_summary(uuid, integer);

create function public.student_habit_summary(p_student_id uuid, p_days integer default 30)
returns table (habit_number integer, ticks integer, last_tick date)
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

  -- Neither habits.name nor habits.id is selected. The id is left out as well
  -- as the name because a stable identifier lets a reader follow one habit
  -- across queries; a position in a list does not.
  return query
    select
      (row_number() over (order by h.created_at, h.id))::integer,
      count(hl.habit_id)::integer,
      max(hl.date)
    from public.habits h
    left join public.habit_logs hl on hl.habit_id = h.id and hl.date >= since
    where h.user_id = p_student_id and h.archived = false
    group by h.id, h.created_at
    order by h.created_at, h.id;
end;
$$;

revoke execute on function
  public.student_mood_series(uuid, integer),
  public.student_habit_summary(uuid, integer)
from public, anon;

grant execute on function
  public.student_mood_series(uuid, integer),
  public.student_habit_summary(uuid, integer)
to authenticated;

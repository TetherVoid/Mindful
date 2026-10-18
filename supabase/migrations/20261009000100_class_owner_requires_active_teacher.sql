-- A class belongs to a teacher only while they are one; a suspended student is
-- visible to nobody; a suspended account cannot edit its own profile.
--
-- Three paths that demotion or deactivation did not reach.
--
-- 1. is_class_teacher() and is_class_owner() answered from classes.owner_id and
--    class_teachers alone. A teacher demoted by set_user_role(), or suspended by
--    set_account_active(), kept every power that goes through them: the roster,
--    the overview, the join code, renaming and archiving, removing students,
--    adding and removing co-teachers, and reading the class and its members.
--    Both now also require is_teacher() -- the teacher or admin role, not
--    deactivated -- the rule create_class() already applies, so an administrator
--    who made a class still runs it. Every caller already ORs is_admin(), so for
--    administrators nothing changes. Nothing is deleted on demotion: restoring
--    the role restores the access. "classes: owner delete" compared owner_id
--    directly, so a demoted or suspended owner could still delete the class and,
--    by cascade, its membership; it now asks is_class_owner().
--
-- 2. may_view_student() never asked whether the STUDENT was suspended.
--    Suspension clears memberships, but "class_members: admin add" can enrol any
--    account, and a suspended student enrolled that way was open to their
--    teacher and the administrator -- and to themselves through the definer read
--    functions, which bypass the journal RLS that already locks them out. A
--    suspended caller now gets false for everyone, themselves included, and a
--    suspended student is visible to nobody.
--
-- 3. "profiles: owner update" checked only auth.uid() = id, so a suspended
--    account could still rename itself and flip share_with_teachers. It now
--    carries the `not is_deactivated()` the four journal policies have carried
--    since 20260911000500. A policy rather than guard_profile_privileges():
--    set_account_active() and deactivate_my_account() run as the table owner,
--    which RLS does not apply to, so the policy cannot block them, while the
--    trigger fires on exactly those privileged writes.
--
-- Unchanged: every signature, return type, grant, SECURITY DEFINER and pinned
-- search_path; the column grant on profiles; guard_profile_privileges();
-- class_roster() and class_overview(), which already omit deactivated students.
-- Tests: supabase/tests/100_class_owner_hardening_test.sql.

create or replace function public.is_class_owner(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_teacher()
     and exists (
       select 1 from public.classes c
       where c.id = p_class_id and c.owner_id = auth.uid()
     );
$$;

create or replace function public.is_class_teacher(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_teacher()
     and (
       exists (
         select 1 from public.classes c
         where c.id = p_class_id and c.owner_id = auth.uid()
       )
       or exists (
         select 1 from public.class_teachers ct
         where ct.class_id = p_class_id and ct.user_id = auth.uid()
       )
     );
$$;

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
      -- A suspended caller reads nobody's figures, their own included: the
      -- journal policies already lock them out, and the definer read functions
      -- must not be a way round that.
      when public.is_deactivated() then false
      -- A suspended student is visible to nobody else, whatever their consent
      -- or enrolment says.
      when exists (
        select 1 from public.profiles p
        where p.id = p_student_id and p.deactivated_at is not null
      ) then false
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

-- CREATE OR REPLACE keeps the existing ACL; restated so this file is the record.
revoke execute on function
  public.is_class_owner(uuid),
  public.is_class_teacher(uuid),
  public.may_view_student(uuid)
from public, anon;

grant execute on function
  public.is_class_owner(uuid),
  public.is_class_teacher(uuid),
  public.may_view_student(uuid)
to authenticated;

drop policy if exists "classes: owner delete" on public.classes;
create policy "classes: owner delete" on public.classes
  for delete using (public.is_class_owner(id) or public.is_admin());

drop policy if exists "profiles: owner update" on public.profiles;
create policy "profiles: owner update" on public.profiles
  for update
  using (auth.uid() = id and not public.is_deactivated())
  with check (auth.uid() = id and not public.is_deactivated());

-- Upgrade 2 of 4: classes, membership, and enrolment.
--
-- Three new tables, the helper functions the policies on them ask their
-- questions through, and the enrolment path. Nothing here touches the five
-- tables production already has.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- A class is owned by the teacher who created it. `join_code` is how a student
-- enrols: a teacher hands out the code rather than looking a student up by
-- email, because a lookup-by-email endpoint is a user-enumeration oracle and a
-- join code is not.
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  join_code text not null unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Teachers assigned to a class. The owner is always included by policy, so this
-- table is for co-teachers.
create table if not exists public.class_teachers (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create table if not exists public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create index if not exists classes_owner_idx on public.classes (owner_id);
create index if not exists class_teachers_user_idx on public.class_teachers (user_id);
create index if not exists class_members_user_idx on public.class_members (user_id);

alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.class_members enable row level security;

revoke all on table public.classes, public.class_teachers, public.class_members from anon;


-- ---------------------------------------------------------------------------
-- 2. Helper functions
--
-- A policy on `class_members` that reads `class_members` to decide who may read
-- `class_members` recurses, and Postgres says so at query time. These cut it:
-- a definer function runs as the table owner and is not itself subject to RLS.
--
-- Same three rules as the helpers in the previous migration — pinned
-- search_path, subject taken from auth.uid() where the question is about the
-- caller, and no grant to anon.
-- ---------------------------------------------------------------------------

create or replace function public.is_class_owner(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
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
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.owner_id = auth.uid()
  ) or exists (
    select 1 from public.class_teachers ct
    where ct.class_id = p_class_id and ct.user_id = auth.uid()
  );
$$;

create or replace function public.is_class_member(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.class_members cm
    where cm.class_id = p_class_id and cm.user_id = auth.uid()
  );
$$;

-- The caller teaches a class the target student is enrolled in. Archived
-- classes do not count: archiving a class is how a teacher ends their
-- relationship with that cohort, and access should end with it.
create or replace function public.teaches_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.class_members cm
    join public.classes c on c.id = cm.class_id
    left join public.class_teachers ct
      on ct.class_id = c.id and ct.user_id = auth.uid()
    where cm.user_id = p_student_id
      and c.archived = false
      and (c.owner_id = auth.uid() or ct.user_id is not null)
  );
$$;

-- The single question every teacher- and admin-facing read funnels into.
--
-- A teacher passes only if all three hold: they hold the teacher role and are
-- not suspended, they teach a live class the student is enrolled in, and that
-- student has opted in to teacher visibility. Losing any one closes the door.
-- The coalesce is the fail-closed direction: no profiles row means no consent.
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
      when public.is_admin() then true
      when public.is_teacher() and public.teaches_student(p_student_id) then coalesce(
        (select p.share_with_teachers from public.profiles p where p.id = p_student_id),
        false
      )
      else false
    end;
$$;

revoke execute on function
  public.is_class_owner(uuid),
  public.is_class_teacher(uuid),
  public.is_class_member(uuid),
  public.teaches_student(uuid),
  public.may_view_student(uuid)
from public, anon;

grant execute on function
  public.is_class_owner(uuid),
  public.is_class_teacher(uuid),
  public.is_class_member(uuid),
  public.teaches_student(uuid),
  public.may_view_student(uuid)
to authenticated;

-- may_view_student is also called by api/report.js, through PostgREST, using
-- the caller's own access token — so it runs as `authenticated` there too and
-- needs no separate grant.


-- ---------------------------------------------------------------------------
-- 3. Policies
-- ---------------------------------------------------------------------------

drop policy if exists "classes: read" on public.classes;
create policy "classes: read" on public.classes
  for select using (
    public.is_class_teacher(id)
    or public.is_class_member(id)
    or public.is_admin()
  );

drop policy if exists "classes: teacher create" on public.classes;
create policy "classes: teacher create" on public.classes
  for insert with check (
    owner_id = auth.uid()
    and public.is_teacher()
    and not public.is_deactivated()
  );

-- A class's teachers may rename it and archive it. They may not change
-- `owner_id` or `join_code`, and the reason is not this policy — it is the
-- column grant below. The WITH CHECK re-tests is_class_teacher(id), which would
-- still be true of a co-teacher who had just written their own id into
-- owner_id, so the policy alone would let a co-teacher take the class. Only
-- create_class() and rotate_join_code(), which run as the table owner, write
-- those two columns.
drop policy if exists "classes: owner update" on public.classes;
create policy "classes: owner update" on public.classes
  for update
  using (public.is_class_teacher(id) or public.is_admin())
  with check (public.is_class_teacher(id) or public.is_admin());

revoke update on public.classes from anon, authenticated;
grant update (name, archived) on public.classes to authenticated;

drop policy if exists "classes: owner delete" on public.classes;
create policy "classes: owner delete" on public.classes
  for delete using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "class_teachers: read" on public.class_teachers;
create policy "class_teachers: read" on public.class_teachers
  for select using (
    user_id = auth.uid()
    or public.is_class_teacher(class_id)
    or public.is_admin()
  );

-- Only the class owner or an administrator may hand out teaching rights, and
-- only to somebody who already holds the teacher role. A co-teacher cannot add
-- further co-teachers; that keeps the set of people who can see a cohort
-- traceable to one decision by one owner.
drop policy if exists "class_teachers: owner manage" on public.class_teachers;
create policy "class_teachers: owner manage" on public.class_teachers
  for insert with check (
    (public.is_class_owner(class_id) or public.is_admin())
    and public.user_has_teacher_role(user_id)
  );

drop policy if exists "class_teachers: owner remove" on public.class_teachers;
create policy "class_teachers: owner remove" on public.class_teachers
  for delete using (public.is_class_owner(class_id) or public.is_admin());

drop policy if exists "class_members: read" on public.class_members;
create policy "class_members: read" on public.class_members
  for select using (
    user_id = auth.uid()
    or public.is_class_teacher(class_id)
    or public.is_admin()
  );

-- No INSERT policy for students. Enrolment goes through join_class() below,
-- which is the only path that checks a join code; a direct insert policy would
-- let a student add themselves to any class whose id they could guess.
drop policy if exists "class_members: admin add" on public.class_members;
create policy "class_members: admin add" on public.class_members
  for insert with check (public.is_admin());

drop policy if exists "class_members: leave or remove" on public.class_members;
create policy "class_members: leave or remove" on public.class_members
  for delete using (
    user_id = auth.uid()
    or public.is_class_teacher(class_id)
    or public.is_admin()
  );


-- ---------------------------------------------------------------------------
-- 4. Enrolment
-- ---------------------------------------------------------------------------

-- Not granted to anyone: only the two definer functions below call it, and they
-- run as the table owner.
create or replace function public.generate_join_code()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

create or replace function public.create_class(p_name text)
returns public.classes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created public.classes;
begin
  if not public.is_teacher() or public.is_deactivated() then
    raise exception 'only a teacher may create a class' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'a class needs a name' using errcode = '22023';
  end if;

  insert into public.classes (name, join_code, owner_id)
  values (left(trim(p_name), 120), public.generate_join_code(), auth.uid())
  returning * into created;

  return created;
end;
$$;

-- Rotating the code is how a teacher closes a class that has been shared too
-- widely, so it is a first-class operation rather than something done by hand.
create or replace function public.rotate_join_code(p_class_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fresh text;
begin
  if not (public.is_class_teacher(p_class_id) or public.is_admin()) then
    raise exception 'not authorised for this class' using errcode = '42501';
  end if;

  fresh := public.generate_join_code();
  update public.classes set join_code = fresh where id = p_class_id;
  return fresh;
end;
$$;

-- Enrolment by code. The only way a student joins a class.
--
-- It returns the same generic failure whether the code is wrong or the class is
-- archived, so it cannot be used to probe which codes exist.
create or replace function public.join_class(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if public.is_deactivated() then
    raise exception 'this account is not active' using errcode = '42501';
  end if;

  select c.id into target
  from public.classes c
  where c.join_code = upper(trim(coalesce(p_code, ''))) and c.archived = false;

  if target is null then
    raise exception 'that join code does not match a class' using errcode = 'P0002';
  end if;

  insert into public.class_members (class_id, user_id, added_by)
  values (target, auth.uid(), auth.uid())
  on conflict (class_id, user_id) do nothing;

  return target;
end;
$$;

create or replace function public.leave_class(p_class_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  delete from public.class_members
  where class_id = p_class_id and user_id = auth.uid();
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

-- Deactivation, and the way back. Deactivating drops the account's class
-- memberships as well as its access: a suspended student should stop appearing
-- on a roster, not sit there greyed out. It lives here rather than with the
-- other role functions because it deletes from the two tables this migration
-- creates.
create or replace function public.set_account_active(p_user_id uuid, p_active boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'only an administrator may deactivate an account' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'an administrator may not deactivate their own account' using errcode = '42501';
  end if;

  perform set_config('mindful.privileged_write', 'on', true);
  update public.profiles
    set deactivated_at = case when p_active then null else now() end
    where id = p_user_id;
  perform set_config('mindful.privileged_write', 'off', true);

  if not p_active then
    delete from public.class_members where user_id = p_user_id;
    delete from public.class_teachers where user_id = p_user_id;
  end if;

  return p_active;
end;
$$;

revoke execute on function
  public.generate_join_code(),
  public.create_class(text),
  public.rotate_join_code(uuid),
  public.join_class(text),
  public.leave_class(uuid),
  public.set_account_active(uuid, boolean)
from public, anon;

grant execute on function
  public.create_class(text),
  public.rotate_join_code(uuid),
  public.join_class(text),
  public.leave_class(uuid),
  public.set_account_active(uuid, boolean)
to authenticated;

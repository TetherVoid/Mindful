-- Mindful — schema, row-level security, roles and classes.
--
-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query ->
-- paste -> Run). It is idempotent: running it again on an existing project
-- adds what is missing and rewrites the policies, without dropping data.
--
-- Read supabase/SECURITY.md for the access model this file implements and the
-- two product decisions baked into it (what a teacher may see, what an admin
-- may see). Read supabase/OAUTH.md before enabling Google or Apple sign-in.

-- ---------------------------------------------------------------------------
-- 0. Roles
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.user_role as enum ('student', 'teacher', 'admin');
exception
  when duplicate_object then null;
end
$$;


-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_utm_source text,
  first_utm_medium text,
  first_utm_campaign text,
  first_utm_term text,
  first_utm_content text,
  created_at timestamptz not null default now()
);

-- Added after the fact, so every column below is `if not exists`.
--
-- `role` is the authorisation fact for the whole application. It is never
-- writable by the user it describes — see § 5. `deactivated_at` is likewise
-- administrative, not personal.
alter table profiles add column if not exists role public.user_role not null default 'student';
alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists deactivated_at timestamptz;
-- Teacher visibility is opt-in: a student shares nothing with their teachers
-- until they say so. `add column if not exists` does not revisit the default on
-- a project where the column already exists, so the default is also set
-- explicitly — otherwise re-running this script would leave an earlier
-- `default true` in place and every new account would be sharing.
--
-- Existing rows keep whatever value they hold. Flipping them is a data
-- decision, not a schema one; to withdraw consent already recorded, run
-- `update public.profiles set share_with_teachers = false;` deliberately.
alter table profiles add column if not exists share_with_teachers boolean not null default false;
alter table profiles alter column share_with_teachers set default false;

alter table profiles drop constraint if exists profiles_display_name_length;
alter table profiles add constraint profiles_display_name_length
  check (display_name is null or char_length(display_name) <= 120);

create table if not exists mood_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mood_score smallint not null check (mood_score between 1 and 5),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (habit_id, date)
);

create table if not exists thought_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  situation text not null,
  automatic_thought text not null,
  emotion text,
  emotion_intensity smallint check (emotion_intensity between 1 and 10),
  evidence_for text,
  evidence_against text,
  balanced_thought text,
  created_at timestamptz not null default now()
);

-- A class is owned by the teacher who created it. `join_code` is how a student
-- enrols: a teacher hands out the code rather than looking a student up by
-- email, because a lookup-by-email endpoint is a user-enumeration oracle and a
-- join code is not.
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  join_code text not null unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Teachers assigned to a class. The owner is always included by policy, so this
-- table is for co-teachers.
create table if not exists class_teachers (
  class_id uuid not null references classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create table if not exists class_members (
  class_id uuid not null references classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  added_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

-- Every role change, including the ones an administrator makes about themselves
-- being refused. A role change with no record of who made it is not an
-- authorisation system, it is a rumour.
create table if not exists role_change_audit (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null,
  previous_role public.user_role,
  new_role public.user_role not null,
  changed_by uuid,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists mood_logs_user_created_idx on mood_logs (user_id, created_at desc);
create index if not exists habits_user_idx on habits (user_id);
create index if not exists habit_logs_user_date_idx on habit_logs (user_id, date desc);
create index if not exists habit_logs_habit_idx on habit_logs (habit_id);
create index if not exists thought_records_user_created_idx on thought_records (user_id, created_at desc);
create index if not exists classes_owner_idx on classes (owner_id);
create index if not exists class_teachers_user_idx on class_teachers (user_id);
create index if not exists class_members_user_idx on class_members (user_id);
create index if not exists role_change_audit_target_idx on role_change_audit (target_user_id, created_at desc);


-- ---------------------------------------------------------------------------
-- 2. Helper functions
--
-- Every policy below asks its questions through these. They are SECURITY
-- DEFINER for one specific reason: a policy on `class_members` that reads
-- `class_members` to decide who may read `class_members` is infinitely
-- recursive, and Postgres will say so at query time. A definer function runs as
-- the table owner, which is not subject to RLS, so the recursion is cut.
--
-- That makes them the most dangerous objects in this file, so each one:
--   * pins `search_path`, so a caller cannot shadow `profiles` with their own
--     table and answer its own authorisation question,
--   * takes its subject from `auth.uid()` rather than from an argument
--     wherever the answer is about the caller,
--   * is revoked from PUBLIC and granted only to `authenticated`.
-- ---------------------------------------------------------------------------

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid()),
    'student'::public.user_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.deactivated_at is null
  );
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('teacher', 'admin')
      and p.deactivated_at is null
  );
$$;

-- Deactivation has to be answerable without a profiles row: accounts that
-- predate this migration have one, but a signup whose trigger failed does not,
-- and locking those people out of their own journal would be the wrong failure.
create or replace function public.is_deactivated()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.deactivated_at is not null
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

-- The single question every teacher- and admin-facing read function asks.
--
-- A teacher's access is conditional on three separate facts, all of which must
-- hold: they hold the teacher role, they teach a live class the student is in,
-- and the student has not opted out of teacher visibility. Losing any one of
-- them closes the door.
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

-- Whether some OTHER user holds a teaching role. Needed because the
-- class_teachers insert policy has to check the person being added, and a
-- teacher has no SELECT policy on anybody else's profiles row — the EXISTS
-- would quietly evaluate to false and the insert would fail for the wrong
-- reason.
create or replace function public.user_has_teacher_role(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.role in ('teacher', 'admin')
      and p.deactivated_at is null
  );
$$;

-- Used by habit_logs' WITH CHECK. Without it a user could file a tick against
-- somebody else's habit as long as they put their own id in `user_id` — the
-- row would pass the owner policy and corrupt another person's register.
create or replace function public.owns_habit(p_habit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.habits h
    where h.id = p_habit_id and h.user_id = auth.uid()
  );
$$;

revoke execute on function
  public.current_user_role(),
  public.is_admin(),
  public.is_teacher(),
  public.is_deactivated(),
  public.is_class_teacher(uuid),
  public.is_class_owner(uuid),
  public.is_class_member(uuid),
  public.teaches_student(uuid),
  public.may_view_student(uuid),
  public.user_has_teacher_role(uuid),
  public.owns_habit(uuid)
from public, anon;

grant execute on function
  public.current_user_role(),
  public.is_admin(),
  public.is_teacher(),
  public.is_deactivated(),
  public.is_class_teacher(uuid),
  public.is_class_owner(uuid),
  public.is_class_member(uuid),
  public.teaches_student(uuid),
  public.may_view_student(uuid),
  public.user_has_teacher_role(uuid),
  public.owns_habit(uuid)
to authenticated;


-- ---------------------------------------------------------------------------
-- 3. Row-level security
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table mood_logs enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;
alter table thought_records enable row level security;
alter table classes enable row level security;
alter table class_teachers enable row level security;
alter table class_members enable row level security;
alter table role_change_audit enable row level security;

revoke all on table classes, class_teachers, class_members, role_change_audit from anon;

-- Journal data: the owner, and nobody else, at the table level.
--
-- Teachers and administrators are deliberately absent from these five policies.
-- They read through the functions in § 6 instead, which return figures and
-- never free text. Written this way the guarantee is structural: there is no
-- policy that could be widened by accident into one that hands a teacher the
-- text of a thought record.
--
-- A deactivated account keeps its rows and loses its access.

drop policy if exists "profiles: owner full access" on profiles;
drop policy if exists "profiles: owner read" on profiles;
create policy "profiles: owner read" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles: owner update" on profiles;
create policy "profiles: owner update" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- No owner INSERT policy: the row is created by the signup trigger in § 4.
-- No owner DELETE policy: the row goes when the auth user goes, by cascade.

drop policy if exists "profiles: admin read" on profiles;
create policy "profiles: admin read" on profiles
  for select using (public.is_admin());

drop policy if exists "mood_logs: owner full access" on mood_logs;
create policy "mood_logs: owner full access" on mood_logs
  for all
  using (auth.uid() = user_id and not public.is_deactivated())
  with check (auth.uid() = user_id and not public.is_deactivated());

drop policy if exists "habits: owner full access" on habits;
create policy "habits: owner full access" on habits
  for all
  using (auth.uid() = user_id and not public.is_deactivated())
  with check (auth.uid() = user_id and not public.is_deactivated());

drop policy if exists "habit_logs: owner full access" on habit_logs;
create policy "habit_logs: owner full access" on habit_logs
  for all
  using (auth.uid() = user_id and not public.is_deactivated())
  with check (
    auth.uid() = user_id
    and not public.is_deactivated()
    and public.owns_habit(habit_id)
  );

drop policy if exists "thought_records: owner full access" on thought_records;
create policy "thought_records: owner full access" on thought_records
  for all
  using (auth.uid() = user_id and not public.is_deactivated())
  with check (auth.uid() = user_id and not public.is_deactivated());

-- Classes.

drop policy if exists "classes: read" on classes;
create policy "classes: read" on classes
  for select using (
    public.is_class_teacher(id)
    or public.is_class_member(id)
    or public.is_admin()
  );

drop policy if exists "classes: teacher create" on classes;
create policy "classes: teacher create" on classes
  for insert with check (
    owner_id = auth.uid()
    and public.is_teacher()
    and not public.is_deactivated()
  );

-- A class's teachers may rename it and archive it. They may not change
-- `owner_id` or `join_code`, and the reason is not this policy — it is the
-- column grant below. The WITH CHECK here re-tests is_class_teacher(id), which
-- would still be true of a co-teacher who had just written their own id into
-- owner_id, so the policy alone would let a co-teacher take the class. Only
-- create_class() and rotate_join_code(), which run as the table owner, write
-- those two columns.
drop policy if exists "classes: owner update" on classes;
create policy "classes: owner update" on classes
  for update
  using (public.is_class_teacher(id) or public.is_admin())
  with check (public.is_class_teacher(id) or public.is_admin());

revoke update on public.classes from anon, authenticated;
grant update (name, archived) on public.classes to authenticated;

drop policy if exists "classes: owner delete" on classes;
create policy "classes: owner delete" on classes
  for delete using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "class_teachers: read" on class_teachers;
create policy "class_teachers: read" on class_teachers
  for select using (
    user_id = auth.uid()
    or public.is_class_teacher(class_id)
    or public.is_admin()
  );

-- Only the class owner or an administrator may hand out teaching rights, and
-- only to somebody who already holds the teacher role. A co-teacher cannot add
-- further co-teachers; that keeps the set of people who can see a cohort
-- traceable to one decision by one owner.
drop policy if exists "class_teachers: owner manage" on class_teachers;
create policy "class_teachers: owner manage" on class_teachers
  for insert with check (
    (
      public.is_class_owner(class_id)
      or public.is_admin()
    )
    and public.user_has_teacher_role(user_id)
  );

drop policy if exists "class_teachers: owner remove" on class_teachers;
create policy "class_teachers: owner remove" on class_teachers
  for delete using (public.is_class_owner(class_id) or public.is_admin());

drop policy if exists "class_members: read" on class_members;
create policy "class_members: read" on class_members
  for select using (
    user_id = auth.uid()
    or public.is_class_teacher(class_id)
    or public.is_admin()
  );

-- No INSERT policy for students. Enrolment goes through join_class() in § 7,
-- which is the only path that checks a join code; a direct insert would let a
-- student add themselves to any class whose id they could guess.
drop policy if exists "class_members: admin add" on class_members;
create policy "class_members: admin add" on class_members
  for insert with check (public.is_admin());

drop policy if exists "class_members: leave or remove" on class_members;
create policy "class_members: leave or remove" on class_members
  for delete using (
    user_id = auth.uid()
    or public.is_class_teacher(class_id)
    or public.is_admin()
  );

-- The audit trail is readable by administrators and by the person the entry is
-- about. Nothing writes to it except the definer functions in § 5.
drop policy if exists "role_change_audit: read" on role_change_audit;
create policy "role_change_audit: read" on role_change_audit
  for select using (target_user_id = auth.uid() or public.is_admin());


-- ---------------------------------------------------------------------------
-- 4. Signup
-- ---------------------------------------------------------------------------

-- Creates the profiles row server-side on signup, bypassing RLS. This matters
-- because when "Confirm email" is on (Supabase's default), signUp() returns no
-- session yet, so a client-side insert into profiles would run unauthenticated
-- and be silently rejected by the policy above.
--
-- Two things this function must never do:
--
--   * take `role` from raw_user_meta_data. That column is whatever the browser
--     passed to signUp({ options: { data } }) — entirely caller-controlled. A
--     single `new.raw_user_meta_data->>'role'` here would make every account an
--     administrator on request. The role is hard-coded to 'student'; the only
--     way out of it is set_user_role() below.
--   * raise. It runs inside the auth.users insert, so an exception here fails
--     the signup itself. UTM capture is not worth losing an account over.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (
    id, role, display_name,
    first_utm_source, first_utm_medium, first_utm_campaign, first_utm_term, first_utm_content
  )
  values (
    new.id,
    'student',
    left(nullif(coalesce(meta->>'full_name', meta->>'name'), ''), 120),
    left(meta->>'utm_source', 200),
    left(meta->>'utm_medium', 200),
    left(meta->>'utm_campaign', 200),
    left(meta->>'utm_term', 200),
    left(meta->>'utm_content', 200)
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- 5. Role escalation
--
-- Three independent barriers, because this is the one thing in the file that
-- must not fail:
--
--   1. Column privileges. `authenticated` has no UPDATE privilege on
--      profiles.role at all, so an UPDATE naming it is rejected by the grant
--      system before any policy is consulted. This is the barrier that holds
--      even if a policy is later widened by mistake.
--   2. A BEFORE UPDATE trigger that rejects a change to role or deactivated_at
--      unless it arrives through the definer functions below.
--   3. set_user_role(), the only sanctioned path, which is administrator-only,
--      refuses self-changes, and refuses to remove the last administrator.
-- ---------------------------------------------------------------------------

revoke update on public.profiles from anon, authenticated;
grant update (
  display_name,
  share_with_teachers,
  first_utm_source,
  first_utm_medium,
  first_utm_campaign,
  first_utm_term,
  first_utm_content
) on public.profiles to authenticated;

-- Set by the definer functions for the duration of their transaction. Anything
-- else changing role or deactivated_at is a bug or an attack, and either way it
-- should fail loudly.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('mindful.privileged_write', true) = 'on' then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'role may only be changed by an administrator through set_user_role()'
      using errcode = '42501';
  end if;

  if new.deactivated_at is distinct from old.deactivated_at then
    raise exception 'deactivated_at may only be changed through set_account_active()'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'profile identity is immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

create or replace function public.set_user_role(
  p_user_id uuid,
  p_role public.user_role,
  p_reason text default null
)
returns public.user_role
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous public.user_role;
begin
  if not public.is_admin() then
    raise exception 'only an administrator may change a role' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'an administrator may not change their own role' using errcode = '42501';
  end if;

  select role into previous from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'no such user' using errcode = 'P0002';
  end if;

  -- Demoting the last administrator would leave the deployment with no way
  -- back in short of the service-role key.
  if previous = 'admin' and p_role <> 'admin' then
    if (select count(*) from public.profiles where role = 'admin' and deactivated_at is null) <= 1 then
      raise exception 'cannot remove the last administrator' using errcode = '42501';
    end if;
  end if;

  perform set_config('mindful.privileged_write', 'on', true);
  update public.profiles set role = p_role where id = p_user_id;
  perform set_config('mindful.privileged_write', 'off', true);

  insert into public.role_change_audit (target_user_id, previous_role, new_role, changed_by, reason)
  values (p_user_id, previous, p_role, auth.uid(), left(p_reason, 500));

  return p_role;
end;
$$;

-- Deactivation, and the way back. Deactivating drops the account's class
-- memberships as well as its access: a suspended student should stop appearing
-- on a roster, not sit there greyed out.
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
  public.set_user_role(uuid, public.user_role, text),
  public.set_account_active(uuid, boolean)
from public, anon;
grant execute on function
  public.set_user_role(uuid, public.user_role, text),
  public.set_account_active(uuid, boolean)
to authenticated;


-- ---------------------------------------------------------------------------
-- 6. What a teacher and an administrator can actually read
--
-- Neither role has any table-level access to mood_logs, habits, habit_logs or
-- thought_records. They read through these functions, and these functions
-- return counts, scores and dates.
--
-- No function here returns a mood note, the situation or the automatic thought
-- from a thought record, or any other free text a student wrote. That is not a
-- filter applied on the way out that a later change might forget — those
-- columns are never selected anywhere in this section, and there is no policy
-- that would let them be read directly.
-- ---------------------------------------------------------------------------

create or replace function public.my_profile()
returns table (
  id uuid,
  role public.user_role,
  display_name text,
  share_with_teachers boolean,
  deactivated_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.role, p.display_name, p.share_with_teachers, p.deactivated_at, p.created_at
  from public.profiles p
  where p.id = auth.uid();
$$;

-- The roster of one class. Teachers of that class, and administrators.
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

-- Figures for one student. Every branch goes through may_view_student(), so a
-- student calling it about themselves gets their own numbers and a teacher gets
-- nothing unless all three conditions in § 2 hold.
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

-- A mood series with the notes left behind. `mood_score` and the day, nothing
-- else: enough to draw the same line the student sees, without reading a word
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
  public.my_profile(),
  public.class_roster(uuid),
  public.student_overview(uuid, integer),
  public.class_overview(uuid, integer),
  public.student_mood_series(uuid, integer),
  public.student_habit_summary(uuid, integer)
from public, anon;
grant execute on function
  public.my_profile(),
  public.class_roster(uuid),
  public.student_overview(uuid, integer),
  public.class_overview(uuid, integer),
  public.student_mood_series(uuid, integer),
  public.student_habit_summary(uuid, integer)
to authenticated;


-- ---------------------------------------------------------------------------
-- 7. Enrolment
-- ---------------------------------------------------------------------------

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
-- widely, so it is a first-class operation rather than something to do by hand.
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
-- archived, so the function cannot be used to probe which codes exist.
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

revoke execute on function
  public.generate_join_code(),
  public.create_class(text),
  public.rotate_join_code(uuid),
  public.join_class(text),
  public.leave_class(uuid)
from public, anon;
grant execute on function
  public.create_class(text),
  public.rotate_join_code(uuid),
  public.join_class(text),
  public.leave_class(uuid)
to authenticated;


-- ---------------------------------------------------------------------------
-- 8. Bootstrapping the first administrator
--
-- There is deliberately no way to become an administrator from inside the
-- application. Promote the first one by hand, here, with the service role:
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
--
-- The guard trigger in § 5 will refuse that statement from a client session and
-- allow it from the SQL Editor only if you disarm it for the transaction:
--
--   begin;
--   select set_config('mindful.privileged_write', 'on', true);
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'you@example.com');
--   commit;
--
-- After that, every further promotion goes through set_user_role() and lands in
-- role_change_audit.
-- ---------------------------------------------------------------------------

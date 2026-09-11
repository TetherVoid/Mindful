-- Baseline: the schema production already has, on 2026-09-11.
--
-- This migration exists so that `supabase db reset` produces a local database
-- that matches production BEFORE the upgrade, and the migrations after it are
-- then exercised locally as the same upgrade production will receive. It is not
-- a description of the intended schema — it is a description of what is there.
--
-- It is reproduced from the repository's `supabase/schema.sql` as it stood at
-- commit 2d2ca2d, which is the DDL production was built from, and it matches
-- the live inspection: five tables, RLS on all five, one FOR ALL owner policy
-- each, and handle_new_user copying UTM values out of signup metadata.
--
-- IT MUST NOT BE RUN AGAINST PRODUCTION. Mark it applied instead, and let
-- 000200 onward do the actual work:
--
--     supabase migration repair --status applied 20260911000100
--
-- Two earlier justifications for that step were wrong and are corrected here,
-- because a rule kept for a false reason is a rule that gets dropped the moment
-- someone checks it:
--
--   * `create event trigger` does NOT require superuser on hosted Supabase.
--     Production shows `postgres` owning both `rls_auto_enable` and `ensure_rls`
--     while not being a superuser.
--   * Nor would it fail on the trigger already existing: the `drop event trigger
--     if exists` below handles that, as every other statement in this file
--     handles its own object already being there.
--
-- The real reason is that this file is a DESCRIPTION of production, and
-- replaying a description against a live database with real users in it is
-- needless churn with a real blast radius. It would drop and recreate the five
-- owner policies, drop and recreate the event trigger that guards DDL, and
-- reinstate the old `handle_new_user` — the one with no conflict handling and no
-- exception block — until 000200 replaces it again moments later. Every one of
-- those windows is short and avoidable, and none of them buys anything, because
-- production already has the end state this file describes.

-- ---------------------------------------------------------------------------
-- public.rls_auto_enable / event trigger ensure_rls
--
-- Reproduced verbatim from production. It is a safety net: any table created in
-- `public` gets row-level security turned on automatically, so a table added in
-- a hurry is closed by default rather than world-readable.
--
-- It is placed first, before any CREATE TABLE, so that every table this
-- migration and the four after it create is subject to it — which is the
-- situation in production, and therefore the situation the tests should run
-- under. The migrations also enable RLS explicitly on every table they create;
-- the two agree, and `enable row level security` is idempotent.
--
-- Note the `search_path` is pinned to pg_catalog, so `format()` and
-- `pg_event_trigger_ddl_commands()` resolve there and nothing in `public` can
-- shadow them.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled row level security on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: could not enable row level security on %: %',
            cmd.object_identity, sqlerrm;
      end;
    else
      raise log 'rls_auto_enable: skipping % in schema %', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$$;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  execute function public.rls_auto_enable();


create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_utm_source text,
  first_utm_medium text,
  first_utm_campaign text,
  first_utm_term text,
  first_utm_content text,
  created_at timestamptz not null default now()
);

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

alter table profiles enable row level security;
alter table mood_logs enable row level security;
alter table habits enable row level security;
alter table habit_logs enable row level security;
alter table thought_records enable row level security;

drop policy if exists "profiles: owner full access" on profiles;
create policy "profiles: owner full access" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Creates the profiles row server-side on signup, bypassing RLS. This matters
-- because when "Confirm email" is on (Supabase's default), signUp() returns no
-- session yet, so a client-side insert into profiles would run unauthenticated
-- and be silently rejected by the policy above.
--
-- This is the PRODUCTION version, warts included: it can raise (an exception
-- here fails the signup that triggered it) and it has no conflict handling.
-- Migration 20260911000200 replaces it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_utm_source, first_utm_medium, first_utm_campaign, first_utm_term, first_utm_content)
  values (
    new.id,
    new.raw_user_meta_data->>'utm_source',
    new.raw_user_meta_data->>'utm_medium',
    new.raw_user_meta_data->>'utm_campaign',
    new.raw_user_meta_data->>'utm_term',
    new.raw_user_meta_data->>'utm_content'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists "mood_logs: owner full access" on mood_logs;
create policy "mood_logs: owner full access" on mood_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "habits: owner full access" on habits;
create policy "habits: owner full access" on habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "habit_logs: owner full access" on habit_logs;
create policy "habit_logs: owner full access" on habit_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "thought_records: owner full access" on thought_records;
create policy "thought_records: owner full access" on thought_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query -> paste -> Run)

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

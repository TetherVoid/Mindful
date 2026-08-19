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

create policy "profiles: owner full access" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "mood_logs: owner full access" on mood_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "habits: owner full access" on habits
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "habit_logs: owner full access" on habit_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "thought_records: owner full access" on thought_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

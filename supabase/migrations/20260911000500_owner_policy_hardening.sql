-- Upgrade 4 of 4: the four journal tables.
--
-- These policies stay owner-only. No teacher clause, no admin clause, no
-- `teaches_student(user_id)` anywhere below — teachers read through the
-- functions in the previous migration and nothing else. The two changes are
-- both tightenings:
--
--   1. a deactivated account loses access to its own rows while keeping them;
--   2. a habit tick must reference a habit the caller owns.
--
-- Neither affects the three existing production users. Nobody is deactivated
-- (the column was created null in 20260911000200), and every habit_log the app
-- has ever written already points at the writer's own habit.
--
-- The policies are recreated rather than altered because PostgreSQL has no
-- syntax for adding a clause to an existing policy. Each is dropped and
-- recreated in the same transaction — this migration file runs as one — so
-- there is no window in which a table is readable without a policy. And the
-- window would be a closed door, not an open one: RLS with no policy denies
-- everything.

-- Used by habit_logs' WITH CHECK. Without it a user can file a tick against
-- somebody else's habit as long as they put their own id in `user_id` — the row
-- passes the owner policy and corrupts another person's register. This is a
-- pre-existing hole in production, not one the roles work introduced.
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

revoke execute on function public.owns_habit(uuid) from public, anon;
grant execute on function public.owns_habit(uuid) to authenticated;

drop policy if exists "mood_logs: owner full access" on public.mood_logs;
create policy "mood_logs: owner full access" on public.mood_logs
  for all
  using (auth.uid() = user_id and not public.is_deactivated())
  with check (auth.uid() = user_id and not public.is_deactivated());

drop policy if exists "habits: owner full access" on public.habits;
create policy "habits: owner full access" on public.habits
  for all
  using (auth.uid() = user_id and not public.is_deactivated())
  with check (auth.uid() = user_id and not public.is_deactivated());

drop policy if exists "habit_logs: owner full access" on public.habit_logs;
create policy "habit_logs: owner full access" on public.habit_logs
  for all
  using (auth.uid() = user_id and not public.is_deactivated())
  with check (
    auth.uid() = user_id
    and not public.is_deactivated()
    and public.owns_habit(habit_id)
  );

drop policy if exists "thought_records: owner full access" on public.thought_records;
create policy "thought_records: owner full access" on public.thought_records
  for all
  using (auth.uid() = user_id and not public.is_deactivated())
  with check (auth.uid() = user_id and not public.is_deactivated());

-- Indexes the new read paths want. Production has none of these on user_id, so
-- every list the app draws is a sequential scan today. CONCURRENTLY is not used
-- because a migration runs in a transaction and these tables are small; at
-- production's current size the lock is measured in milliseconds.
create index if not exists mood_logs_user_created_idx
  on public.mood_logs (user_id, created_at desc);
create index if not exists habits_user_idx
  on public.habits (user_id);
create index if not exists habit_logs_user_date_idx
  on public.habit_logs (user_id, date desc);
create index if not exists habit_logs_habit_idx
  on public.habit_logs (habit_id);
create index if not exists thought_records_user_created_idx
  on public.thought_records (user_id, created_at desc);

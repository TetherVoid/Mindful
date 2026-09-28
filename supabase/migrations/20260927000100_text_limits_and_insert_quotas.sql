-- Text limits, per-account daily insert quotas, and server-set timestamps.
--
-- Before this migration a single signed-in student could fill the free-tier
-- database: every journal text column was unbounded, one request could insert
-- thousands of rows, and nothing counted how much one account wrote. Five
-- requests of incompressible text grew a local copy by 20.8 MB.
--
-- Three things, each needed for the others to hold:
--
--   1. CHECK constraints on every free-text column a user can write.
--   2. A daily quota per account on the four journal tables, enforced once per
--      INSERT statement, so a bulk insert of 5,000 rows is refused as a whole.
--   3. created_at is set by the server. Without this the quota could be dodged
--      by inserting rows dated 2019, or by re-dating rows afterwards so they
--      fall out of the 24-hour window.
--
-- Rows already over a limit are NOT truncated — they are someone's writing.
-- Each constraint is added NOT VALID (enforced for new and updated rows from
-- now on) and then validated only if no existing row breaks it. If one does,
-- the migration says how many and leaves that constraint unvalidated; a later
-- migration can validate it once the rows have been looked at.

-- ---------------------------------------------------------------------------
-- 1. Text limits
-- ---------------------------------------------------------------------------

create temporary table pending_limits (tbl text, con text, expr text) on commit drop;

insert into pending_limits values
  ('mood_logs',       'mood_logs_note_length',                  'note is null or char_length(note) <= 2000'),
  ('thought_records', 'thought_records_situation_length',       'char_length(situation) <= 2000'),
  ('thought_records', 'thought_records_automatic_thought_length', 'char_length(automatic_thought) <= 2000'),
  ('thought_records', 'thought_records_evidence_for_length',    'evidence_for is null or char_length(evidence_for) <= 4000'),
  ('thought_records', 'thought_records_evidence_against_length', 'evidence_against is null or char_length(evidence_against) <= 4000'),
  ('thought_records', 'thought_records_balanced_thought_length', 'balanced_thought is null or char_length(balanced_thought) <= 2000'),
  ('thought_records', 'thought_records_emotion_length',         'emotion is null or char_length(emotion) <= 60'),
  ('habits',          'habits_name_length',                     'char_length(name) <= 80'),
  ('profiles',        'profiles_first_utm_source_length',       'first_utm_source is null or char_length(first_utm_source) <= 200'),
  ('profiles',        'profiles_first_utm_medium_length',       'first_utm_medium is null or char_length(first_utm_medium) <= 200'),
  ('profiles',        'profiles_first_utm_campaign_length',     'first_utm_campaign is null or char_length(first_utm_campaign) <= 200'),
  ('profiles',        'profiles_first_utm_term_length',         'first_utm_term is null or char_length(first_utm_term) <= 200'),
  ('profiles',        'profiles_first_utm_content_length',      'first_utm_content is null or char_length(first_utm_content) <= 200'),
  ('role_change_audit', 'role_change_audit_reason_length',      'reason is null or char_length(reason) <= 500'),
  ('classes',         'classes_join_code_format',               'join_code ~ ''^[0-9A-F]{10}$''');

do $$
declare
  r record;
  offenders bigint;
begin
  for r in select * from pending_limits loop
    execute format('alter table public.%I add constraint %I check (%s) not valid', r.tbl, r.con, r.expr);
    execute format('select count(*) from public.%I where not (%s)', r.tbl, r.expr) into offenders;
    if offenders = 0 then
      execute format('alter table public.%I validate constraint %I', r.tbl, r.con);
    else
      raise notice '% existing row(s) in % exceed %; left unvalidated, nothing truncated',
        offenders, r.tbl, r.con;
    end if;
  end loop;
end;
$$;

-- The UTM columns are written once, by handle_new_user(), from sign-up
-- metadata. Nothing in the app updates them afterwards, and letting a student
-- update them was a way to store a megabyte in their own profile row.
revoke update (first_utm_source, first_utm_medium, first_utm_campaign, first_utm_term, first_utm_content)
  on public.profiles from authenticated;


-- ---------------------------------------------------------------------------
-- 2. created_at belongs to the server
-- ---------------------------------------------------------------------------

-- Applies to requests from the API roles only. Migrations, tests and the SQL
-- Editor run as postgres and may still set a timestamp deliberately.
create or replace function public.pin_created_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.pin_created_at() from public, anon, authenticated;

create trigger mood_logs_pin_created_at before insert or update on public.mood_logs
  for each row execute function public.pin_created_at();
create trigger thought_records_pin_created_at before insert or update on public.thought_records
  for each row execute function public.pin_created_at();
create trigger habits_pin_created_at before insert or update on public.habits
  for each row execute function public.pin_created_at();
create trigger habit_logs_pin_created_at before insert or update on public.habit_logs
  for each row execute function public.pin_created_at();


-- ---------------------------------------------------------------------------
-- 3. Daily quotas
-- ---------------------------------------------------------------------------

-- Checked once per INSERT statement, after the rows are in, against every row
-- the account wrote in the last 24 hours (the new ones included). Over the
-- limit, the whole statement is refused with SQLSTATE PT429, which PostgREST
-- turns into HTTP 429.
--
-- SECURITY INVOKER on purpose: current_user is the caller, so the role test
-- below means what it says, and the count runs under the caller's own RLS —
-- which is exactly "the rows this account can see", i.e. its own.
create or replace function public.enforce_daily_quota()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_limit integer := tg_argv[0]::integer;
  v_user uuid;
  v_count integer;
begin
  if current_user not in ('authenticated', 'anon') then
    return null;
  end if;

  for v_user in select distinct user_id from new_rows loop
    execute format(
      'select count(*) from public.%I where user_id = $1 and created_at > now() - interval ''24 hours''',
      tg_table_name
    ) into v_count using v_user;

    if v_count > v_limit then
      raise exception 'daily limit reached for %', tg_table_name
        using errcode = 'PT429',
              detail = format('%s rows in 24 hours; the limit is %s', v_count, v_limit),
              hint = 'quota';
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.enforce_daily_quota() from public, anon, authenticated;

create trigger mood_logs_daily_quota after insert on public.mood_logs
  referencing new table as new_rows
  for each statement execute function public.enforce_daily_quota('50');
create trigger thought_records_daily_quota after insert on public.thought_records
  referencing new table as new_rows
  for each statement execute function public.enforce_daily_quota('25');
create trigger habits_daily_quota after insert on public.habits
  referencing new table as new_rows
  for each statement execute function public.enforce_daily_quota('20');
create trigger habit_logs_daily_quota after insert on public.habit_logs
  referencing new table as new_rows
  for each statement execute function public.enforce_daily_quota('300');

-- mood_logs and thought_records already have (user_id, created_at) indexes.
create index if not exists habits_user_created_idx on public.habits (user_id, created_at desc);
create index if not exists habit_logs_user_created_idx on public.habit_logs (user_id, created_at desc);

-- Read-only checks to run in the production SQL editor BEFORE pushing
-- 20260927000100, 20260927000200 and 20261009000100. Nothing here writes.
-- Paste one block at a time and keep the results for the approval reply.

-- A. What production already has. Expect the last version to be
--    20260926000100, and every count below to be 0.
select version from supabase_migrations.schema_migrations order by version desc limit 5;

select count(*) as already_present_constraints
from pg_constraint
where conname like '%\_length' escape '\' or conname = 'classes_join_code_format';

select count(*) as already_present_triggers
from pg_trigger
where not tgisinternal
  and (tgname like '%pin\_created\_at%' escape '\' or tgname like '%daily\_quota%' escape '\');

-- B. Rows over the new length limits. Any non-zero `over` must be fixed (with
--    approval) before pushing: a NOT VALID limit still blocks UPDATEs of that
--    row, so an over-long profile could no longer be suspended or re-roled.
select 'mood_logs.note' as col, count(*) filter (where char_length(note) > 2000) as over, max(char_length(note)) as longest from public.mood_logs
union all select 'thought_records.situation', count(*) filter (where char_length(situation) > 2000), max(char_length(situation)) from public.thought_records
union all select 'thought_records.automatic_thought', count(*) filter (where char_length(automatic_thought) > 2000), max(char_length(automatic_thought)) from public.thought_records
union all select 'thought_records.evidence_for', count(*) filter (where char_length(evidence_for) > 4000), max(char_length(evidence_for)) from public.thought_records
union all select 'thought_records.evidence_against', count(*) filter (where char_length(evidence_against) > 4000), max(char_length(evidence_against)) from public.thought_records
union all select 'thought_records.balanced_thought', count(*) filter (where char_length(balanced_thought) > 2000), max(char_length(balanced_thought)) from public.thought_records
union all select 'thought_records.emotion', count(*) filter (where char_length(emotion) > 60), max(char_length(emotion)) from public.thought_records
union all select 'habits.name', count(*) filter (where char_length(name) > 80), max(char_length(name)) from public.habits
union all select 'profiles.first_utm_source', count(*) filter (where char_length(first_utm_source) > 200), max(char_length(first_utm_source)) from public.profiles
union all select 'profiles.first_utm_medium', count(*) filter (where char_length(first_utm_medium) > 200), max(char_length(first_utm_medium)) from public.profiles
union all select 'profiles.first_utm_campaign', count(*) filter (where char_length(first_utm_campaign) > 200), max(char_length(first_utm_campaign)) from public.profiles
union all select 'profiles.first_utm_term', count(*) filter (where char_length(first_utm_term) > 200), max(char_length(first_utm_term)) from public.profiles
union all select 'profiles.first_utm_content', count(*) filter (where char_length(first_utm_content) > 200), max(char_length(first_utm_content)) from public.profiles
union all select 'role_change_audit.reason', count(*) filter (where char_length(reason) > 500), max(char_length(reason)) from public.role_change_audit;

-- C. Join codes that don't match the new format. Expect 0.
select count(*) as bad_join_codes from public.classes where join_code !~ '^[0-9A-F]{10}$';

-- D. Information only: who loses access when 20261009000100 applies.
select c.id, c.archived, p.role, p.deactivated_at
from public.classes c left join public.profiles p on p.id = c.owner_id
where p.id is null or p.role not in ('teacher', 'admin') or p.deactivated_at is not null;

select ct.class_id, ct.user_id, p.role, p.deactivated_at
from public.class_teachers ct left join public.profiles p on p.id = ct.user_id
where p.id is null or p.role not in ('teacher', 'admin') or p.deactivated_at is not null;

select count(*) as suspended_students_enrolled
from public.class_members cm join public.profiles p on p.id = cm.user_id
where p.deactivated_at is not null;

-- Read-only checks to run in the production SQL editor BEFORE pushing
-- 20261009000100. Nothing here writes. Paste one block at a time.
--
-- 20260927000100 and 20260927000200 are already applied in production
-- (confirmed by the owner, 2026-10-09), so this push carries one file.

-- A. Production is where this push expects it: the latest applied version is
--    20260927000200, and 20261009000100 is not there yet.
select version from supabase_migrations.schema_migrations order by version desc limit 3;

select count(*) as already_applied   -- expect 0
from supabase_migrations.schema_migrations
where version = '20261009000100';

-- B. Information only: who loses access when 20261009000100 applies.
--    Classes whose owner is not an active teacher or admin become admin-only.
select c.id, c.archived, p.role, p.deactivated_at
from public.classes c left join public.profiles p on p.id = c.owner_id
where p.id is null or p.role not in ('teacher', 'admin') or p.deactivated_at is not null;

--    Co-teachers who are not active teachers lose the class.
select ct.class_id, ct.user_id, p.role, p.deactivated_at
from public.class_teachers ct left join public.profiles p on p.id = ct.user_id
where p.id is null or p.role not in ('teacher', 'admin') or p.deactivated_at is not null;

--    Suspended students still enrolled become invisible to everyone.
select count(*) as suspended_students_enrolled
from public.class_members cm join public.profiles p on p.id = cm.user_id
where p.deactivated_at is not null;

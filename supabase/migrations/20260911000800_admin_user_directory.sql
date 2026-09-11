-- Administrators need to find people before they can administer them.
--
-- `set_user_role()` and `set_account_active()` both take a uuid, and until now
-- there was no sanctioned way to obtain one. This is that way, and it is the
-- only place in the schema that returns another person's email address.
--
-- It reads `auth.users`, which no client role can select from. That is the
-- reason it is SECURITY DEFINER, and it is also why the authorisation check is
-- the first statement in the body: past that line the function is running with
-- the owner's reach.
--
-- Note what it does NOT return. No mood note, no thought record, no figures —
-- it is a directory, not a window into anyone's journal. An administrator who
-- wants figures goes through `student_overview()` like a teacher does, and gets
-- counts rather than text.
--
-- This deliberately does not exist for teachers. A teacher enrolling a student
-- uses a join code (see 000300); an endpoint that answers "does this address
-- have an account" is a user-enumeration oracle, and the whole schema is built
-- to avoid having one. Restricting it to administrators does not make it stop
-- being one — it makes the set of people holding it small, named, and recorded
-- in `role_change_audit`.

create or replace function public.admin_list_users(
  search text default null,
  page_limit integer default 50,
  page_offset integer default 0
)
returns table (
  id uuid,
  email text,
  display_name text,
  role public.user_role,
  deactivated_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  -- Clamped, not trusted. These arrive from a browser, and an uncapped LIMIT is
  -- how one administrator's mistyped request becomes a full table scan returning
  -- every account in one response.
  v_limit  integer := least(greatest(coalesce(page_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(page_offset, 0), 0);
  v_needle text    := nullif(btrim(coalesce(search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'only an administrator may list users' using errcode = '42501';
  end if;

  -- ILIKE treats % and _ as wildcards, so a search for "a_b" would quietly match
  -- "axb". Escaping them makes the search mean what was typed. The backslash has
  -- to go first or it would escape the escapes.
  if v_needle is not null then
    v_needle := replace(replace(replace(v_needle, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  return query
    select
      p.id,
      u.email::text,
      p.display_name,
      p.role,
      p.deactivated_at,
      p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where v_needle is null
       or u.email::text ilike '%' || v_needle || '%'
       or coalesce(p.display_name, '') ilike '%' || v_needle || '%'
    -- created_at alone is not unique enough to page on: several accounts made in
    -- the same migration share a timestamp, and a non-deterministic order means
    -- a row can appear on two pages or none. The id breaks the tie.
    order by p.created_at asc, p.id asc
    limit v_limit
    offset v_offset;
end;
$$;

revoke execute on function public.admin_list_users(text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;

-- Authorisation is inside the function, not in this grant. `authenticated` is
-- every signed-in user; `is_admin()` is what separates them, and it reads the
-- caller's own profiles row via auth.uid() rather than anything they passed in.

do $$
declare
  callable integer;
begin
  select count(*) into callable
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  if callable > 0 then
    raise exception 'anon can execute % function(s) in public', callable;
  end if;
end
$$;

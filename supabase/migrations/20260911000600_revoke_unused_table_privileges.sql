-- Upgrade 5 of 5: take away three privileges no client has ever needed.
--
-- Supabase's default privileges grant ALL on every table in `public` to `anon`
-- and `authenticated`. ALL includes TRUNCATE, REFERENCES and TRIGGER, and
-- production grants all three on `profiles` today.
--
-- None of them is reachable through PostgREST, so this is not a live hole. It is
-- removing standing authority nobody uses:
--
--   TRUNCATE    empties a table in one statement and, unlike DELETE, is not
--               filtered by row-level security — RLS simply does not apply to
--               it. That is the one that would actually hurt.
--   REFERENCES  lets a role point a foreign key at the table, which pins rows
--               against deletion from a table the referrer controls.
--   TRIGGER     lets a role attach a trigger, i.e. run its own code inside
--               somebody else's write.
--
-- SELECT, INSERT, UPDATE and DELETE are untouched; those are what the
-- application uses and what the policies are written against.
--
-- This runs last so it covers the tables the earlier migrations created as well
-- as the five that were already there.

revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- `revoke ... on all tables` expands to the tables that exist right now; it
-- leaves no standing rule. A table created later inherits Supabase's default
-- privileges again, which includes all three.
--
-- That is deliberately not fixed here with `alter default privileges`. Supabase
-- manages the default privileges on this schema, and a rule of ours that quietly
-- subtracts from theirs is the kind of thing that surprises whoever next adds a
-- table and cannot work out why. The `ensure_rls` event trigger already closes
-- the dangerous half of the same problem — a new table arrives with RLS on — and
-- RLS is what stands between a client and other people's rows.
--
-- If a table is added later and this matters, re-run the statement above.

do $$
declare
  leftover integer;
begin
  select count(*) into leftover
  from information_schema.table_privileges
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER');

  if leftover > 0 then
    raise exception 'revoke did not take: % grants remain', leftover;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- And the one function grant left over from the baseline.
--
-- `rls_auto_enable()` is reproduced verbatim from production, grants included,
-- so it arrives with Supabase's default EXECUTE for anon and authenticated.
-- Postgres refuses the call anyway — "trigger functions can only be called as
-- triggers" — so this is not a hole being closed. It is the audit query
-- "what can anon execute in public?" being made to answer zero, so that the
-- day it answers one, that is a finding rather than a footnote.
--
-- Safe after the fact: an event trigger's EXECUTE privilege is checked when the
-- trigger is created, not each time it fires.
-- ---------------------------------------------------------------------------

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

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
    raise exception 'anon can still execute % function(s) in public', callable;
  end if;
end
$$;

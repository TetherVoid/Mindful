# The access model

What `schema.sql` enforces, and why it draws the lines where it does. Read this
before widening a policy — several of them are narrow on purpose, and the reason
is not always obvious from the SQL.

## The three roles

`profiles.role` is a `user_role` enum: `student`, `teacher`, `admin`. Everyone
starts as a student.

The role lives in the `profiles` table and nowhere else. Not in the JWT, not in
`raw_user_meta_data`. That is the important part: `raw_user_meta_data` is
whatever the browser passed to `signUp({ options: { data } })`, so it is
attacker-controlled, and a signup trigger that read a role out of it would hand
out administrator on request.

## What each role can reach

| | own journal | other students' figures | other students' free text | classes | roles |
|---|---|---|---|---|---|
| student | read/write | — | — | join, leave | — |
| teacher | read/write | own classes only, opt-in | **never** | create, manage own | — |
| admin | read/write | all | **never** | all | grant, revoke, suspend |

Two of those cells are decisions rather than deductions, so they are spelled out
below.

### Nobody but the author reads what the author wrote

Teachers and administrators have **no table-level access** to `mood_logs`,
`habits`, `habit_logs` or `thought_records`. There is no policy on those four
tables that mentions either role. What a teacher gets instead is a set of
`SECURITY DEFINER` functions — `class_overview`, `student_overview`,
`student_mood_series`, `student_habit_summary` — that return counts, scores and
dates.

None of those functions selects `mood_logs.note`, `thought_records.situation`,
`thought_records.automatic_thought`, or any other free-text column. That is not
a filter applied on the way out which a later edit might forget: those columns
are never named anywhere in § 6 of the schema, and there is no policy that would
let them be read directly. A teacher can see that a student logged eleven
entries averaging 2.4 last month. A teacher cannot see a word of what they said.

If a future feature needs a teacher to see more, the answer is another function
returning more figures — not a `for select using (teaches_student(user_id))`
policy on `thought_records`. That one line would undo the whole guarantee.

### An administrator administers; they are not a supervisor

Admins can grant and revoke roles, suspend accounts, and see every class. They
read the same figures a teacher does, and the same free text a teacher does,
which is none.

`api/account.js` deliberately implements deletion of the caller's own account
only. There is no administrative delete. Suspension (`set_account_active`) is
the administrative operation, and unlike deletion it is reversible.

### Teacher visibility is opt-in, per student

`profiles.share_with_teachers` defaults to **false**. A teacher who creates a
class and enrols a cohort sees an empty overview until the students in it choose
to share; `may_view_student()` returns false for every teacher until then, and
the student is absent from `class_roster`'s figures and from `class_overview`
entirely — absent rather than shown as a row of zeroes, because a row of zeroes
reads as "this child has stopped writing", which is not what it means.

Expect that to look broken the first time a teacher opens a class. It is the
intended state: nothing about how a child feels reaches an adult who did not ask
until the child agrees to it.

Two consequences worth planning for rather than discovering:

- A teacher-facing screen needs to distinguish "nobody has shared" from "nobody
  has written anything". `class_roster` returns every enrolled student with
  their `share_with_teachers` flag, so the roster can show who has opted in
  while `class_overview` carries figures only for those who have.
- Students need somewhere to say yes. Until Settings has that control, the flag
  can only be changed through `updateMyProfile({ shareWithTeachers: true })`,
  which means in practice it stays false.

To make it opt-out instead, change the column default to `true` — both places in
`schema.sql` § 1, since the `alter column … set default` is what a re-run
honours — and change `normaliseProfile()` in `backend/services/profile.js`,
which currently reads an absent value as "no".

## Role escalation: three barriers

Preventing a user from promoting themselves is the one thing in the schema that
must not fail, so it does not rest on a single mechanism.

1. **Column privileges.** `revoke update on profiles from authenticated`,
   followed by `grant update (display_name, share_with_teachers, …)`. The
   `authenticated` role has no UPDATE privilege on `role` or `deactivated_at` at
   all, so a statement naming either is rejected by the grant system before any
   policy is consulted. This is the barrier that still holds if somebody later
   widens a policy by mistake.
2. **A `BEFORE UPDATE` trigger.** `guard_profile_privileges` raises `42501` on
   any change to `role`, `deactivated_at`, `id` or `created_at` that did not
   arrive through the sanctioned functions. Those functions announce themselves
   by setting `mindful.privileged_write` for the duration of their transaction —
   a GUC that cannot be set from PostgREST, because `set_config` lives in
   `pg_catalog` and PostgREST only exposes functions in the API schemas.
3. **`set_user_role()`.** Administrator-only, refuses to change the caller's own
   role, refuses to remove the last administrator, and writes to
   `role_change_audit` on every success.

## Recursive RLS, and why the helpers are `SECURITY DEFINER`

A policy on `class_members` that reads `class_members` to decide who may read
`class_members` recurses, and Postgres says so at query time. Every such
question is therefore asked through a definer function, which runs as the table
owner and is not itself subject to RLS.

That makes those functions the most dangerous objects in the file, so each one:

- pins `search_path = public, pg_temp`, so a caller cannot create their own
  `profiles` table on a schema earlier in the path and answer its own
  authorisation question;
- takes its subject from `auth.uid()` rather than from an argument wherever the
  answer is about the caller;
- is `revoke execute … from public, anon` and granted only to `authenticated`.

`may_view_student()` is the one they all funnel into. A teacher passes it only
if **all three** hold: they hold the teacher role and are not suspended, they
teach a live (non-archived) class the student is enrolled in, and that student
has not opted out. Archiving a class ends access with it — that is what
archiving is for.

## Enrolment is by code

There is no find-a-student-by-email call anywhere in the schema or the services.
An endpoint that answers "does this address have an account" is a
user-enumeration oracle, and for an application that records how children feel,
that is a worse leak than it first sounds.

A teacher hands out `classes.join_code`; the student calls `join_class(code)`.
The function returns the same generic failure whether the code is wrong or the
class is archived, so it cannot be used to probe which codes exist.
`rotate_join_code()` closes a class whose code has travelled too far.

Note that the join code is not a secret from the class: a student's policy lets
them read the row they are enrolled in, code included. Treat it as
shared-within-the-class.

## Bootstrapping

There is deliberately no way to become the first administrator from inside the
app. Promote one by hand with the service role — the exact statement is at the
bottom of `schema.sql`. Every promotion after that goes through
`set_user_role()` and lands in `role_change_audit`.

## What this schema does not do

Stated plainly, so nobody assumes otherwise:

- **No sign-in blocking for suspended accounts.** Supabase issues the token
  before any of this runs. Suspension takes effect on the first authenticated
  query — RLS denies the four journal tables, and `AuthContext` ends the session
  on the next page load. A suspended user's token stays technically valid until
  it expires; it just cannot read anything.
- **No audit of reads.** `role_change_audit` records who changed whose role. It
  does not record which teacher looked at which student's figures. If that
  matters for your deployment, it is a trigger on the definer functions in § 6
  and a table to write to.
- **No rate limit on `join_class`.** The codes are 10 hex characters (40 bits),
  which is not brute-forceable at HTTP speeds, but there is nothing in the
  database stopping someone trying.

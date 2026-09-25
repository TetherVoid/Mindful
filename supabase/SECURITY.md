# The access model

What `schema.sql` enforces, and why it draws the lines where it does. Read this
before widening a policy — several of them are narrow on purpose, and the reason
is not always obvious from the SQL.

## Which project this describes

**Production is the `Mindful` project, ref `czvejcytunugftbspxmr`, Mumbai
(`ap-south-1`).** Everything below describes what is enforced there.

The older `TetherVoid's Project`, ref `ydbhuynqjymfkqllijzc` (Seoul), is
**deprecated**. It is a frozen backup, its three accounts are test accounts that
are not being migrated, and it must not be linked to, migrated, or modified. See
`MIGRATIONS.md` § Which project is production.

This matters to the access model and not just to operations: every guarantee
below is a property of one database. Two deployments pointed at two different
projects do not share a `profiles` table, so they do not share roles,
suspensions, or consent. `api/_lib/auth.js` refuses to start work when
`SUPABASE_URL` and `VITE_SUPABASE_URL` name different projects, because a
function that verifies a caller against one database and acts on another is
authenticating nobody in particular.

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
| teacher | read/write | own live classes only, **opt-in** | **never** | create, manage own | — |
| admin | read/write | students in any live class, **opt-in** | **never** | all | grant, revoke, suspend |

"Opt-in" means the student has switched on `share_with_teachers`. It is the only
consent a student gives, and since migration `20260925000100` it is the only
thing that opens a student's figures to anyone else — teacher or administrator.

Two of those cells are decisions rather than deductions, so they are spelled out
below.

### Nobody but the author reads what the author wrote

Teachers and administrators have **no table-level access** to `mood_logs`,
`habits`, `habit_logs` or `thought_records`. There is no policy on those four
tables that mentions either role. What they get instead is a set of
`SECURITY DEFINER` functions that return counts, scores and dates:

| Function | Returns |
|---|---|
| `class_overview` | per student: entry counts, average mood, active habits, habit ticks, thought-record count, last-activity times |
| `student_overview` | the same figures for one student |
| `student_mood_series` | `(day, mood_score)` per entry — **no time of day** |
| `student_habit_summary` | `(habit_number, ticks, last_tick)` — **no habit name, no habit id** |

None of those functions selects `mood_logs.note`, `thought_records.situation`,
`thought_records.automatic_thought`, `habits.name`, or any other free-text
column. That is not a filter applied on the way out which a later edit might
forget: those columns are never named in the read functions, and there is no
policy that would let them be read directly. A teacher can see that a student
logged eleven entries averaging 2.4 last month and ticked their second habit
nine times. A teacher cannot see a word of what they said — and a habit's name
*is* something they said, which is why `20260925000100` took it out.

The same migration took `logged_at` out of `student_mood_series`. The day and
the score draw the student's line; the time of day a child writes is
behavioural detail that no reader of figures needs.

If a future feature needs a teacher to see more, the answer is another function
returning more figures — not a `for select using (teaches_student(user_id))`
policy on `thought_records`. That one line would undo the whole guarantee.

### An administrator administers; they are not a supervisor

Admins can grant and revoke roles, suspend accounts, see every class, and read
every class's roster — who is enrolled, and whether each student shares. That is
administration, and none of it says anything about how a student is doing.

A student's figures are another matter. An administrator reads them on the same
terms as a teacher: only if the student has switched on `share_with_teachers`,
and only while the student is enrolled in at least one live class — the
classroom context the student consented in. An administrator reads the same
free text a teacher does, which is none.

Until `20260925000100` an administrator passed `may_view_student()` for every
student regardless of consent. That was a deliberate choice then; it was
reversed because "Share figures with teachers" is the only consent a student
gives, and an adult reading figures the student never agreed to share is not
administering anything.

`api/account.js` deliberately implements deletion of the caller's own account
only. There is no administrative delete. Suspension (`set_account_active`) is
the administrative operation, and unlike deletion it is reversible.

`admin_list_users(search, page_limit, page_offset)` is the one place in the
schema that returns another person's email address. It exists because
`set_user_role()` and `set_account_active()` take a uuid and there has to be a
sanctioned way to obtain one. It is administrator-only, returns no journal
content of any kind, escapes `%` and `_` in the search term so a search means
what was typed, and clamps `page_limit` to 100 server-side.

It is deliberately not available to teachers. An endpoint answering "does this
address have an account" is a user-enumeration oracle; restricting it to
administrators does not stop it being one, it just makes the set of people
holding it small and named. Teachers enrol students with a join code instead.

### Closing your own account

`deactivate_my_account()` is the one privileged write a user may perform on their
own profile. Its safety is structural rather than checked:

- **It takes no arguments.** There is no user id in the signature and none in the
  body but `auth.uid()`, so a caller has nowhere to name somebody else. That is
  stronger than accepting an id and verifying it — a verification can be edited
  out by someone who does not see why it is there; a missing parameter cannot.
- **It only ever sets.** `deactivated_at` is written to `now()`, never to null,
  so it is not a toggle and cannot undo an administrator's suspension.
- **It does not touch `role`.** The UPDATE names one column.

Reactivation stays with `set_account_active()`, and a deactivated account fails
`is_admin()` whatever its role — so a suspended administrator cannot lift their
own suspension either.

### Visibility is opt-in, per student, for teachers and administrators alike

`profiles.share_with_teachers` defaults to **false**. A teacher who creates a
class and enrols a cohort sees an empty overview until the students in it choose
to share; `may_view_student()` returns false for every teacher and every
administrator until then, and the student is absent from `class_overview`
entirely — absent rather than shown as a row of zeroes, because a row of zeroes
reads as "this child has stopped writing", which is not what it means.

`class_overview()` decides whose figures to include by asking
`may_view_student()` about each student, so there is one rule for figure access
rather than two. Before `20260925000100` it applied its own filter, which
checked consent but not whether the class was archived — so the teacher of an
archived class still saw its students' figures, despite archiving being
documented as ending access. It no longer does.

Expect that to look broken the first time a teacher opens a class. It is the
intended state: nothing about how a child feels reaches an adult who did not ask
until the child agrees to it.

Two consequences that were worth planning for, and how the app now handles them:

- A teacher-facing screen has to distinguish "nobody has shared" from "nobody is
  enrolled" — and from "nobody has written anything". `frontend/pages/Classes.jsx`
  calls `class_roster` and `class_overview` together for exactly this reason:
  the roster is the whole membership with each student's `share_with_teachers`
  flag, and the overview carries figures only for those who opted in. An empty
  roster says nobody has joined; a full roster with an empty overview says the
  class has kept its figures private, and the page says so in those words rather
  than showing a blank list.
- Students need somewhere to say yes. Settings § 01 has that control, backed by
  `updateMyProfile({ shareWithTeachers })`. It stays **disabled until the
  profile has loaded**, and a save made before then omits the field entirely
  rather than sending the default — otherwise a page saved in its first moment
  would write `share_with_teachers = false` and silently revoke consent the
  student had already given. An opt-in that a race can switch off is not an
  opt-in.

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
   by setting `mindful.privileged_write` for the duration of their transaction.

   The flag is not itself a secret and was never a barrier: `set_config()` is
   executable by PUBLIC, so any session — a signed-in browser included — can
   turn it on for itself. What the guard checks is **who is asking**. It honours
   the flag only when `current_user` is neither `authenticated` nor `anon`.
   Inside a SECURITY DEFINER function `current_user` is the function's owner, so
   `set_user_role()` and `set_account_active()` are believed; the same flag set
   by hand in a client session is ignored. `session_user` would be the wrong
   test — it stays `authenticated` inside those functions and would lock them
   out.
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

`may_view_student()` is the one they all funnel into. Consent is checked first,
before any role, so no later branch can forget it. After that, a teacher passes
only if they hold the teacher role, are not suspended, and teach a live
(non-archived) class the student is enrolled in. An administrator passes only if
they are not suspended and the student is enrolled in at least one live class.
A student always passes for themselves. Archiving a class ends access with it —
that is what archiving is for.

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

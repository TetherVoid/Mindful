// The shapes that cross agent boundaries.
//
// This project is plain JavaScript, so there is no type checker to enforce any
// of this. These JSDoc typedefs are documentation with a machine-readable shape:
// editors and coding agents resolve them for completion, and a human reviewer
// can see at a glance what a service is expected to hand back.
//
// The rule that makes them useful is social, not technical — see AGENT_RULES.md
// § Shared types. Adding a field is free. Renaming or removing one is a
// cross-agent change, because another agent's code is reading it.

/**
 * A row from `mood_logs`.
 * @typedef  {object}  MoodLog
 * @property {string}  id
 * @property {string}  user_id
 * @property {1|2|3|4|5} mood_score
 * @property {string|null} note
 * @property {string}  created_at   ISO timestamp
 */

/**
 * A row from `habits`.
 * @typedef  {object}  Habit
 * @property {string}  id
 * @property {string}  user_id
 * @property {string}  name
 * @property {boolean} archived
 * @property {string}  created_at
 */

/**
 * A row from `habit_logs`. One tick, one habit, one calendar day.
 * @typedef  {object}  HabitLog
 * @property {string}  id
 * @property {string}  habit_id
 * @property {string}  user_id
 * @property {string}  date         local ISO date, YYYY-MM-DD
 * @property {string}  created_at
 */

/**
 * A row from `thought_records` — one CBT worksheet.
 * @typedef  {object}  ThoughtRecord
 * @property {string}  id
 * @property {string}  user_id
 * @property {string}  situation
 * @property {string}  automatic_thought
 * @property {string|null} emotion
 * @property {number|null} emotion_intensity   1-10
 * @property {string|null} evidence_for
 * @property {string|null} evidence_against
 * @property {string|null} balanced_thought
 * @property {string}  created_at
 */

/**
 * A row from `profiles`, as `my_profile()` returns it.
 *
 * `role` is the application's authorisation fact. It is read from this table
 * and nowhere else — not from the JWT, not from user metadata, both of which
 * are shaped by whatever the browser sent. Nothing in the client may write it:
 * `authenticated` holds no UPDATE privilege on the column, and the only path
 * that changes it is the administrator-only set_user_role().
 *
 * @typedef  {object}  Profile
 * @property {string}  id
 * @property {'student'|'teacher'|'admin'} role
 * @property {string|null}  display_name
 * @property {boolean} share_with_teachers  false hides this student's figures from their teachers
 * @property {string|null}  deactivated_at   ISO timestamp; set means the account is suspended
 * @property {string|null}  created_at
 */

/**
 * A row from `classes`.
 *
 * `join_code` is only ever returned to the class's own teachers and to
 * administrators — a student's row-level policy lets them read the class they
 * are in, code included, so treat it as shared-within-the-class, not secret.
 * Rotate it with rotateJoinCode() when it has travelled too far.
 *
 * @typedef  {object}  ClassRoom
 * @property {string}  id
 * @property {string}  name
 * @property {string}  join_code
 * @property {string}  owner_id
 * @property {boolean} archived     archiving also ends its teachers' access to those students
 * @property {string}  created_at
 */

/**
 * One student as a teacher sees them: figures only.
 *
 * There is deliberately no field here for a mood note, a situation, an
 * automatic thought, or any other sentence the student wrote. The database
 * functions that produce this shape never select those columns, and teachers
 * have no table-level access that would let them be read another way.
 *
 * @typedef  {object}  StudentOverview
 * @property {string}  user_id
 * @property {string|null} display_name
 * @property {number}  mood_entries
 * @property {number|null} average_mood
 * @property {string|null} last_mood_at
 * @property {number}  active_habits
 * @property {number}  habit_ticks
 * @property {number}  thought_record_count
 * @property {string|null} last_activity_at
 */

/**
 * One row of the class roster: who is enrolled, and whether they share figures.
 *
 * This is the whole membership of a class, sharers and non-sharers alike, which
 * is what makes it different from StudentOverview — `class_overview()` omits a
 * student who has not opted in, so the two together are how a page tells
 * "nobody is enrolled" apart from "nobody has opted in". It carries no figures
 * and no written text.
 *
 * @typedef  {object}  RosterEntry
 * @property {string}  user_id
 * @property {string|null} display_name
 * @property {boolean} share_with_teachers
 * @property {string}  joined_at
 */

/**
 * One row of the administrator's user directory, as `admin_list_users()`
 * returns it.
 *
 * `email` is the reason this shape is administrator-only: it is the single
 * place in the schema where one person's address is returned to another. It
 * carries no figures and nothing the user wrote.
 *
 * @typedef  {object}  DirectoryUser
 * @property {string}  id
 * @property {string}  email
 * @property {string|null} display_name
 * @property {'student'|'teacher'|'admin'} role
 * @property {string|null} deactivated_at
 * @property {string|null} created_at
 */

/**
 * One row of `role_change_audit`.
 *
 * Written only by set_user_role(); there is no client path that inserts here.
 *
 * @typedef  {object}  RoleChange
 * @property {string}  id
 * @property {string}  target_user_id
 * @property {'student'|'teacher'|'admin'|null} previous_role
 * @property {'student'|'teacher'|'admin'} new_role
 * @property {string|null} changed_by
 * @property {string|null} reason
 * @property {string}  created_at
 */

/**
 * What every backend service returns.
 *
 * Deliberately the same `{ data, error }` shape Supabase itself uses. Services
 * wrap queries without changing the calling convention, so a page never has to
 * learn a second error-handling style and the frontend agent can swap a raw
 * query for a service call one line at a time.
 *
 * @template T
 * @typedef  {object} ServiceResult
 * @property {T|null} data
 * @property {{ message: string }|null} error
 */

/**
 * The written report rendered by frontend/pages/Report.jsx.
 *
 * Produced two ways that must stay interchangeable: by Claude via
 * /api/report, and locally by backend/services/report/narrative.js. The page
 * renders whichever it is given without branching, so both producers owe every
 * field below.
 *
 * @typedef  {object}   Report
 * @property {string}   title
 * @property {string}   summary
 * @property {{ heading: string, body: string }[]} sections
 * @property {string[]} noticed
 * @property {string[]} questions
 * @property {'claude'|'local'} source
 * @property {string}  [model]
 */

export {}

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

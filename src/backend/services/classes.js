import { supabase } from '../database/client'
import { TABLES } from '@shared/constants/tables'

// Classes, enrolment, and the figures a teacher is allowed to see.
//
// Two things are worth knowing before adding anything to this file.
//
// First, a teacher has no table-level access to mood_logs, habits, habit_logs
// or thought_records at all. Every teacher-facing read below goes through a
// SECURITY DEFINER function in supabase/schema.sql § 6, and those functions
// return counts, scores and dates. None of them selects a mood note, a
// situation, an automatic thought, or any other sentence a student wrote. If a
// teacher view needs more detail, the answer is a new function that returns
// more figures — not a policy that hands over the text.
//
// Second, enrolment is by join code and nothing else. There is no
// find-a-student-by-email call here on purpose: an endpoint that answers
// "does this address have an account" is a user-enumeration oracle, and for an
// app that records how children feel that is a worse leak than it sounds.

/**
 * Every class the caller can see: the ones they teach, and the ones they are
 * enrolled in. RLS decides which, so this is the same query for both roles.
 *
 * @returns {Promise<import('@shared/contracts').ServiceResult<import('@shared/contracts').ClassRoom[]>>}
 */
export function listMyClasses({ includeArchived = false } = {}) {
  const query = supabase
    .from(TABLES.classes)
    .select('id, name, join_code, owner_id, archived, created_at')
    .order('created_at', { ascending: true })

  return includeArchived ? query : query.eq('archived', false)
}

/**
 * Create a class. Teacher or administrator only; the join code is generated
 * server-side so it cannot be chosen (and therefore cannot be guessed from a
 * pattern somebody picked).
 */
export async function createClass(name) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return { data: null, error: { message: 'A class needs a name.' } }
  if (trimmed.length > 120) {
    return { data: null, error: { message: 'A class name can be at most 120 characters.' } }
  }
  return supabase.rpc('create_class', { p_name: trimmed })
}

/** Retire a class. Archiving also ends its teachers' access to those students. */
export function archiveClass(classId) {
  return supabase.from(TABLES.classes).update({ archived: true }).eq('id', classId)
}

export function renameClass(classId, name) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return Promise.resolve({ data: null, error: { message: 'A class needs a name.' } })
  return supabase.from(TABLES.classes).update({ name: trimmed.slice(0, 120) }).eq('id', classId)
}

/** Issue a fresh join code, invalidating the old one. */
export function rotateJoinCode(classId) {
  return supabase.rpc('rotate_join_code', { p_class_id: classId })
}

/** Enrol the signed-in user in a class using a code their teacher gave them. */
export async function joinClass(code) {
  const trimmed = String(code ?? '').trim().toUpperCase()
  if (!trimmed) return { data: null, error: { message: 'Enter the code your teacher gave you.' } }
  return supabase.rpc('join_class', { p_code: trimmed })
}

export function leaveClass(classId) {
  return supabase.rpc('leave_class', { p_class_id: classId })
}

/** Remove one student from a class. Teachers of that class, and administrators. */
export function removeClassMember({ classId, userId }) {
  return supabase
    .from(TABLES.classMembers)
    .delete()
    .eq('class_id', classId)
    .eq('user_id', userId)
}

/** Who is in a class. Teachers of that class, and administrators. */
export function listClassRoster(classId) {
  return supabase.rpc('class_roster', { p_class_id: classId })
}

/** Co-teachers on a class. Adding one is the class owner's decision alone. */
export function listClassTeachers(classId) {
  return supabase
    .from(TABLES.classTeachers)
    .select('class_id, user_id, added_by, created_at')
    .eq('class_id', classId)
}

export async function addClassTeacher({ classId, userId }) {
  const { data: sessionData } = await supabase.auth.getUser()
  return supabase
    .from(TABLES.classTeachers)
    .insert({ class_id: classId, user_id: userId, added_by: sessionData?.user?.id ?? null })
    .select()
    .single()
}

export function removeClassTeacher({ classId, userId }) {
  return supabase
    .from(TABLES.classTeachers)
    .delete()
    .eq('class_id', classId)
    .eq('user_id', userId)
}

// --- Figures ----------------------------------------------------------------

/**
 * One row per student in a class: how many entries, the average score, when
 * they were last active. Students who have opted out of teacher visibility are
 * absent from the result rather than shown empty — a row of zeroes reads as
 * "this child has stopped writing", which is not what it means.
 *
 * @returns {Promise<import('@shared/contracts').ServiceResult<import('@shared/contracts').StudentOverview[]>>}
 */
export function loadClassOverview(classId, { days = 30 } = {}) {
  return supabase.rpc('class_overview', { p_class_id: classId, p_days: days })
}

/** The same figures for one student. Works for a teacher, and for a student about themselves. */
export function loadStudentOverview(studentId, { days = 30 } = {}) {
  return supabase.rpc('student_overview', { p_student_id: studentId, p_days: days })
}

/** Mood scores and dates. No notes — the function does not select that column. */
export function loadStudentMoodSeries(studentId, { days = 30 } = {}) {
  return supabase.rpc('student_mood_series', { p_student_id: studentId, p_days: days })
}

/** Habit names and tick counts. */
export function loadStudentHabitSummary(studentId, { days = 30 } = {}) {
  return supabase.rpc('student_habit_summary', { p_student_id: studentId, p_days: days })
}

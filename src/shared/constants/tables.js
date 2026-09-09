// Database table names, in one place.
//
// Backend services are the only code that should reference these; they live in
// shared/ because the schema in supabase/schema.sql, the fixture builder and the
// services all have to agree on the same strings.
export const TABLES = {
  profiles: 'profiles',
  moodLogs: 'mood_logs',
  habits: 'habits',
  habitLogs: 'habit_logs',
  thoughtRecords: 'thought_records',
  classes: 'classes',
  classTeachers: 'class_teachers',
  classMembers: 'class_members',
  roleChangeAudit: 'role_change_audit',
}

// How long each free-text field may be, in characters.
//
// These mirror the CHECK constraints in supabase/migrations/
// 20260927000100_text_limits_and_insert_quotas.sql. The database is what
// enforces them; the numbers here only let a field stop at the limit and say
// so, instead of the save failing afterwards. Change both together.
export const TEXT_LIMITS = {
  moodNote: 2000,
  situation: 2000,
  automaticThought: 2000,
  emotion: 60,
  evidenceFor: 4000,
  evidenceAgainst: 4000,
  balancedThought: 2000,
  habitName: 80,
}

// What a student sees when the daily insert quota (the same migration) says no.
export const DAILY_QUOTA_MESSAGE =
  'That is a lot for one day — the rest can wait until tomorrow. Everything you have written so far is saved.'

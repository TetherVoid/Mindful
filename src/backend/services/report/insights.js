// Everything the report knows, derived in the browser from the rows the page
// already had to fetch. Nothing here touches the network.
//
// This module is deliberately the only place that turns rows into figures.
// The local narrative and the Claude-written one both read the same object, so
// the two versions of the report can never disagree about the numbers — only
// about the prose wrapped around them.

import { toLocalISODate, todayISO } from '@shared/utils/date'

const MOOD_LABELS = { 1: 'Awful', 2: 'Low', 3: 'Even', 4: 'Good', 5: 'Bright' }
const MOOD_SCORES = [1, 2, 3, 4, 5]
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// A comparison drawn from two or three entries is noise dressed as a finding.
// Every split figure below is withheld until both sides clear this.
const MIN_SPLIT_SAMPLE = 3
const MIN_TREND_SAMPLE = 6
const HABIT_RATE_WINDOW = 30

function mean(values) {
  if (!values.length) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function round(value, places = 1) {
  if (value == null) return null
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function stdev(values) {
  if (values.length < 2) return null
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

function daysBetween(fromISO, toISO) {
  const ms = new Date(`${toISO}T00:00:00`) - new Date(`${fromISO}T00:00:00`)
  return Math.round(ms / 86400000)
}

function shiftISO(iso, days) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toLocalISODate(d)
}

// Rising/falling only when the gap is big enough to survive rounding to one
// decimal place — below that the two halves are the same number wearing
// different digits.
const TREND_THRESHOLD = 0.25

function describeTrend(earlier, recent, unit = 'up') {
  if (earlier == null || recent == null) return null
  const delta = recent - earlier
  const direction =
    Math.abs(delta) < TREND_THRESHOLD ? 'steady' : delta > 0 ? 'rising' : 'falling'
  return {
    direction,
    // A rising intensity score is a worsening signal, a rising mood score an
    // improving one. `unit` records which way "up" points so the prose layer
    // does not have to remember per-metric.
    betterWhen: unit,
    delta: round(delta, 2),
    earlier: round(earlier, 2),
    recent: round(recent, 2),
  }
}

// Splits a time-ordered list down the middle and compares the halves. Used for
// both mood and emotion intensity, which is why it takes an accessor.
function halvesTrend(sortedRows, valueOf, unit) {
  const values = sortedRows.map(valueOf).filter((v) => typeof v === 'number')
  if (values.length < MIN_TREND_SAMPLE) return null
  const middle = Math.floor(values.length / 2)
  const earlier = values.slice(0, middle)
  const recent = values.slice(values.length - middle)
  return {
    ...describeTrend(mean(earlier), mean(recent), unit),
    earlierCount: earlier.length,
    recentCount: recent.length,
  }
}

function loggingStreak(dateSet) {
  let streak = 0
  let cursor = todayISO()
  // Today not being logged yet shouldn't zero an intact streak — the same
  // concession the habit register makes.
  if (!dateSet.has(cursor)) cursor = shiftISO(cursor, -1)
  while (dateSet.has(cursor)) {
    streak += 1
    cursor = shiftISO(cursor, -1)
  }
  return streak
}

function analyseMoods(moods) {
  const rows = [...moods]
    .filter((m) => typeof m.mood_score === 'number')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  if (!rows.length) {
    return { count: 0, mean: null, latest: null, distribution: [], byWeekday: [], notes: 0 }
  }

  const scores = rows.map((r) => r.mood_score)
  const dates = rows.map((r) => toLocalISODate(new Date(r.created_at)))
  const dateSet = new Set(dates)

  const counts = Object.fromEntries(MOOD_SCORES.map((s) => [s, 0]))
  for (const score of scores) counts[score] += 1

  // Weekday means are the figure most likely to be over-read, so a day needs
  // MIN_SPLIT_SAMPLE entries before it gets an average at all.
  const byWeekday = WEEKDAYS.map((label, index) => {
    const dayScores = rows
      .filter((r) => new Date(r.created_at).getDay() === index)
      .map((r) => r.mood_score)
    return {
      day: label,
      count: dayScores.length,
      mean: dayScores.length >= MIN_SPLIT_SAMPLE ? round(mean(dayScores), 2) : null,
    }
  })
  const ranked = byWeekday.filter((d) => d.mean != null).sort((a, b) => b.mean - a.mean)

  const first = dates[0]
  const last = dates[dates.length - 1]
  const span = daysBetween(first, last) + 1

  return {
    count: rows.length,
    mean: round(mean(scores), 2),
    median: round(scores.slice().sort((a, b) => a - b)[Math.floor(scores.length / 2)], 1),
    spread: round(stdev(scores), 2),
    latest: { score: rows[rows.length - 1].mood_score, date: last },
    latestLabel: MOOD_LABELS[rows[rows.length - 1].mood_score],
    first,
    last,
    spanDays: span,
    daysCovered: dateSet.size,
    coverage: round(dateSet.size / span, 2),
    streak: loggingStreak(dateSet),
    notes: rows.filter((r) => r.note && r.note.trim()).length,
    trend: halvesTrend(rows, (r) => r.mood_score, 'up'),
    distribution: MOOD_SCORES.map((score) => ({
      score,
      label: MOOD_LABELS[score],
      count: counts[score],
    })),
    byWeekday,
    brightest: ranked[0] ?? null,
    heaviest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
  }
}

function analyseHabits(habits, habitLogs) {
  const active = habits.filter((h) => !h.archived)
  const datesByHabit = new Map()
  for (const log of habitLogs) {
    if (!datesByHabit.has(log.habit_id)) datesByHabit.set(log.habit_id, new Set())
    datesByHabit.get(log.habit_id).add(log.date)
  }

  const windowStart = shiftISO(todayISO(), -(HABIT_RATE_WINDOW - 1))

  const list = active.map((habit) => {
    const dates = datesByHabit.get(habit.id) ?? new Set()
    const recent = [...dates].filter((d) => d >= windowStart)
    // A habit added four days ago has not "missed" the twenty-six before it,
    // so the denominator is its own age, capped at the window.
    const age = habit.created_at
      ? Math.min(HABIT_RATE_WINDOW, daysBetween(toLocalISODate(new Date(habit.created_at)), todayISO()) + 1)
      : HABIT_RATE_WINDOW
    const denominator = Math.max(1, age)
    return {
      name: habit.name,
      streak: loggingStreak(dates),
      total: dates.size,
      recent: recent.length,
      windowDays: denominator,
      rate: round(recent.length / denominator, 2),
    }
  })

  const ranked = [...list].sort((a, b) => b.rate - a.rate)
  const overall = list.length
    ? round(mean(list.map((h) => h.rate)), 2)
    : null

  return {
    active: active.length,
    archived: habits.length - active.length,
    list: ranked,
    strongest: ranked[0] ?? null,
    weakest: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    overallRate: overall,
    longestStreak: list.reduce((best, h) => (h.streak > best ? h.streak : best), 0),
  }
}

function analyseThoughts(thoughts) {
  const rows = [...thoughts].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  if (!rows.length) {
    return { count: 0, emotions: [], reframeRate: null, meanIntensity: null }
  }

  const intensities = rows
    .map((r) => r.emotion_intensity)
    .filter((v) => typeof v === 'number')

  // Emotions are free text, so "Anxious" and "anxious" are the same feeling
  // typed twice. Group on a lowercased key, display the first spelling used.
  const byEmotion = new Map()
  for (const row of rows) {
    const raw = (row.emotion ?? '').trim()
    if (!raw) continue
    const key = raw.toLowerCase()
    if (!byEmotion.has(key)) byEmotion.set(key, { name: raw, count: 0, intensities: [] })
    const entry = byEmotion.get(key)
    entry.count += 1
    if (typeof row.emotion_intensity === 'number') entry.intensities.push(row.emotion_intensity)
  }

  const emotions = [...byEmotion.values()]
    .map((e) => ({
      name: e.name,
      count: e.count,
      meanIntensity: e.intensities.length ? round(mean(e.intensities), 1) : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const filled = (value) => Boolean(value && value.trim())
  const first = toLocalISODate(new Date(rows[0].created_at))
  const last = toLocalISODate(new Date(rows[rows.length - 1].created_at))
  const span = daysBetween(first, last) + 1

  return {
    count: rows.length,
    first,
    last,
    spanDays: span,
    perWeek: round((rows.length / span) * 7, 1),
    meanIntensity: intensities.length ? round(mean(intensities), 1) : null,
    intensityTrend: halvesTrend(rows, (r) => r.emotion_intensity, 'down'),
    // The three fields that mark a record as worked-through rather than merely
    // vented into. Low rates here are the most actionable thing the report has.
    reframeRate: round(rows.filter((r) => filled(r.balanced_thought)).length / rows.length, 2),
    evidenceRate: round(
      rows.filter((r) => filled(r.evidence_for) && filled(r.evidence_against)).length / rows.length,
      2
    ),
    counterEvidenceRate: round(
      rows.filter((r) => filled(r.evidence_against)).length / rows.length,
      2
    ),
    emotions,
  }
}

// The one figure neither the mood page nor the register can show on its own:
// how the two logs line up on the same calendar day.
function analyseLinks(moods, habitLogs, thoughts) {
  const moodByDate = new Map()
  for (const m of moods) {
    if (typeof m.mood_score !== 'number') continue
    const date = toLocalISODate(new Date(m.created_at))
    if (!moodByDate.has(date)) moodByDate.set(date, [])
    moodByDate.get(date).push(m.mood_score)
  }

  const habitDates = new Set(habitLogs.map((l) => l.date))
  const thoughtDates = new Set(
    thoughts.map((t) => toLocalISODate(new Date(t.created_at)))
  )

  const kept = []
  const missed = []
  const wrote = []
  const didnt = []
  for (const [date, scores] of moodByDate) {
    const dayMean = mean(scores)
    ;(habitDates.has(date) ? kept : missed).push(dayMean)
    ;(thoughtDates.has(date) ? wrote : didnt).push(dayMean)
  }

  function compare(a, b, labels) {
    if (a.length < MIN_SPLIT_SAMPLE || b.length < MIN_SPLIT_SAMPLE) return null
    return {
      ...labels,
      withMean: round(mean(a), 2),
      withoutMean: round(mean(b), 2),
      delta: round(mean(a) - mean(b), 2),
      withDays: a.length,
      withoutDays: b.length,
    }
  }

  return {
    // Deliberately named "gap", not "effect" — same-day co-occurrence in a
    // handful of days is an association and the prose must not upgrade it.
    habitDays: compare(kept, missed, {
      label: 'days a habit was ticked',
      against: 'days none was',
    }),
    thoughtDays: compare(wrote, didnt, {
      label: 'days a thought record was written',
      against: 'days none was',
    }),
  }
}

function findGaps({ mood, habits, thoughts }) {
  const gaps = []
  if (mood.count && mood.coverage != null && mood.coverage < 0.4) {
    gaps.push(
      `Mood is logged on ${Math.round(mood.coverage * 100)}% of the days in this stretch, so the line between entries is guesswork.`
    )
  }
  if (mood.count && mood.notes === 0) {
    gaps.push('No mood entry carries a note, so the scores have no context attached to them.')
  }
  if (thoughts.count && thoughts.reframeRate != null && thoughts.reframeRate < 0.5) {
    gaps.push(
      `${Math.round((1 - thoughts.reframeRate) * 100)}% of thought records stop before the balanced thought.`
    )
  }
  if (thoughts.count && thoughts.counterEvidenceRate != null && thoughts.counterEvidenceRate < 0.5) {
    gaps.push('Most records list evidence for the thought without listing evidence against it.')
  }
  if (habits.active === 0) {
    gaps.push('No habits are being kept, so nothing links the daily mood to a daily action.')
  }
  return gaps
}

/**
 * Turns the four tables into the single object every part of the report reads.
 * All arguments default to empty so a day-one account produces a valid — if
 * mostly null — set of figures rather than throwing.
 */
export function buildInsights({ moods = [], habits = [], habitLogs = [], thoughts = [] } = {}) {
  const mood = analyseMoods(moods)
  const habitStats = analyseHabits(habits, habitLogs)
  const thoughtStats = analyseThoughts(thoughts)

  return {
    generatedFor: todayISO(),
    totals: {
      moods: moods.length,
      habits: habitStats.active,
      habitLogs: habitLogs.length,
      thoughts: thoughtStats.count,
    },
    mood,
    habits: habitStats,
    thoughts: thoughtStats,
    links: analyseLinks(moods, habitLogs, thoughts),
    gaps: findGaps({ mood, habits: habitStats, thoughts: thoughtStats }),
  }
}

// Below this, the report has nothing to describe and says so instead of
// inventing a trend out of two data points.
export const MIN_ENTRIES_FOR_REPORT = 3

export function hasEnoughToReport(insights) {
  const { moods, thoughts, habitLogs } = insights.totals
  return moods + thoughts + habitLogs >= MIN_ENTRIES_FOR_REPORT
}

/**
 * The exact payload that leaves the browser when a Claude-written report is
 * requested. Split out from buildInsights so it can be shown to the user
 * verbatim before they press the button — what is disclosed and what is sent
 * are the same function's output, not two lists that can drift apart.
 *
 * Figures only. The wording of thought records and mood notes is never sent:
 * an opt-in that included it was removed on 2026-09-25, for every user, and
 * api/report.js no longer reads an `excerpts` field even if one arrives.
 * Bringing it back would need both ends changed and the privacy copy
 * rewritten, which is deliberate.
 */
export function buildReportPayload(insights) {
  return { figures: insights }
}

export { MOOD_LABELS }

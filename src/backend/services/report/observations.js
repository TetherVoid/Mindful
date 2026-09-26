// Short observations for the day sheet, the mood page and the habits page.
//
// Everything here reads figures that buildInsights() has already gated (see
// the thresholds at the top of insights.js), so a comparison only reaches this
// file once both sides have a fortnight of days and the gap is bigger than the
// student's own day-to-day noise. This file adds no statistics of its own; it
// chooses one figure and says it plainly.
//
// House rules for the wording, the same as the reading's:
//   - every observation carries the counts it rests on;
//   - lining up is not causing, and the text says so where it matters;
//   - no advice, no encouragement to do more, no judgement of better/worse;
//   - nothing is triggered by a low mood — a falling line is described in the
//     same neutral words as a rising one.
//
// Deliberately NOT used on these pages: the comparison between days a thought
// record was written and days none was. Students write records on hard days,
// so that gap usually reads as "writing records goes with lower mood" — the
// wrong way round, and a reason to stop the one practice the app teaches. It
// stays on the reading, where there is room to ask which way round it runs.

import { THRESHOLDS } from './insights'

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function habitLink(insights) {
  const link = insights.links.habitDays
  if (!link) return null
  return {
    kind: 'habit-link',
    text: `Days you tick a habit average ${link.withMean} out of 5; days you don't, ${link.withoutMean}.`,
    basis: `Over ${plural(link.withDays, 'day')} and ${plural(link.withoutDays, 'day')} · two columns lining up, not a cause`,
  }
}

function weekdayPattern(insights) {
  const { brightest, heaviest } = insights.mood
  if (!brightest || !heaviest) return null
  return {
    kind: 'weekday',
    text: `${brightest.day}s tend to be your brightest days (${brightest.mean} out of 5), ${heaviest.day}s your heaviest (${heaviest.mean}).`,
    basis: `Over ${plural(brightest.count, brightest.day)} and ${plural(heaviest.count, heaviest.day)} · a pattern in the calendar, not a verdict`,
  }
}

function moodTrend(insights) {
  const trend = insights.mood.trend
  if (!trend || trend.direction === 'steady') return null
  // Neutral wording in both directions: the page describes, it does not
  // congratulate or worry.
  return {
    kind: 'trend',
    text: `Your last ${plural(trend.recentCount, 'day')} average ${trend.recent} out of 5, against ${trend.earlier} for the ${plural(trend.earlierCount, 'day')} before.`,
    basis: 'A change bigger than ordinary day-to-day variation',
  }
}

function steadiestHabit(insights) {
  const habit = insights.habits.strongest
  if (!habit || habit.recent < 7 || habit.rate < 0.6) return null
  return {
    kind: 'steady-habit',
    text: `“${habit.name}” is your steadiest habit: ticked on ${habit.recent} of the last ${plural(habit.windowDays, 'day')}.`,
    basis: 'From the register',
  }
}

function progress(insights) {
  const days = insights.mood.days ?? 0
  if (days === 0) return null
  if (days < THRESHOLDS.MIN_SPLIT_SAMPLE) {
    return {
      kind: 'progress',
      text: `${plural(days, 'day')} on the page so far. Once there are a couple of weeks, this sheet starts noticing patterns.`,
      basis: 'Patterns are shown only when they are bigger than chance',
    }
  }
  return {
    kind: 'progress',
    text: 'Nothing here stands out from ordinary day-to-day variation yet — which is worth knowing too.',
    basis: `Read from ${plural(days, 'day')} of entries`,
  }
}

/** The one observation the day sheet leads with, or null on a blank book. */
export function dayObservation(insights) {
  return (
    habitLink(insights) ??
    weekdayPattern(insights) ??
    moodTrend(insights) ??
    steadiestHabit(insights) ??
    progress(insights)
  )
}

/** Up to two observations for the habits page. */
export function habitObservations(insights) {
  const out = []
  const link = habitLink(insights)
  if (link) {
    out.push(link)
  } else if (insights.mood.count && insights.habits.active > 0) {
    const p = insights.links.progress.habitDays
    const needed = insights.links.progress.needed
    out.push({
      kind: 'progress',
      text: p.ready
        ? 'Days with a habit ticked and days without come out about the same so far — no gap bigger than ordinary variation.'
        : `To compare days with a habit ticked and days without, this needs ${needed} of each. So far there are ${p.withDays} and ${p.withoutDays}.`,
      basis: 'Patterns are shown only when they are bigger than chance',
    })
  }
  const steady = steadiestHabit(insights)
  if (steady) out.push(steady)
  return out
}

const WEEK_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/**
 * The mood page's weekday strip, Monday first: each day's average, or null
 * until that weekday has enough days behind it, plus a sentence to go with it.
 */
export function weekdayStrip(insights) {
  const byDay = new Map(insights.mood.byWeekday.map((d) => [d.day, d]))
  const cells = WEEK_ORDER.map((day) => {
    const d = byDay.get(day) ?? { count: 0, mean: null }
    return { day, short: day.slice(0, 3), count: d.count, mean: d.mean }
  })
  const pattern = weekdayPattern(insights)
  const note = pattern
    ? pattern
    : cells.every((c) => c.mean == null)
      ? {
          kind: 'progress',
          text: `A weekday gets an average once it has ${THRESHOLDS.MIN_WEEKDAY_SAMPLE} days logged.`,
          basis: 'Fewer than that and one odd day would decide it',
        }
      : {
          kind: 'progress',
          text: 'No weekday stands out from ordinary day-to-day variation.',
          basis: 'Averages of days, not of entries',
        }
  return { cells, note }
}

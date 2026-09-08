// The report, written locally from the figures in insights.js.
//
// This is what the page shows when Claude is not reachable — no key configured,
// fixtures mode, a failed request, or the user choosing to keep the data in the
// browser. It produces the same shape the API returns, so Report.jsx renders
// one thing either way and never branches on where the words came from.
//
// The rule this file follows: every sentence must be traceable to a number.
// Nothing here interprets, diagnoses, or advises — it reads the figures back.

const PERCENT = (value) => `${Math.round(value * 100)}%`

function pluralise(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`
}

function trendWord(trend) {
  if (!trend) return null
  if (trend.direction === 'steady') return 'level'
  // Movement only. The trend carries a `betterWhen` marking which direction is
  // the good one, and this deliberately ignores it — the report describes what
  // the figures did, and leaves what that is worth to the reader.
  return trend.direction === 'rising' ? 'higher' : 'lower'
}

function moodSection(mood) {
  if (!mood.count) return null

  const parts = []
  parts.push(
    `${pluralise(mood.count, 'entry', 'entries')} across ${pluralise(mood.spanDays, 'day')}, averaging ${mood.mean} out of 5.`
  )

  if (mood.trend) {
    const word = trendWord(mood.trend)
    parts.push(
      word === 'level'
        ? `The second half of that stretch sits level with the first (${mood.trend.earlier} then ${mood.trend.recent}).`
        : `The most recent ${mood.trend.recentCount} entries average ${mood.trend.recent}, against ${mood.trend.earlier} for the ${mood.trend.earlierCount} before them — ${word} by ${Math.abs(mood.trend.delta)}.`
    )
  }

  if (mood.spread != null) {
    parts.push(
      mood.spread < 0.7
        ? `The scores cluster tightly (spread ${mood.spread}), so the run reads as one steady mood rather than swings.`
        : `The scores are spread wide (${mood.spread}), so the average hides days at both ends.`
    )
  }

  if (mood.brightest && mood.heaviest && mood.brightest.day !== mood.heaviest.day) {
    parts.push(
      `By weekday, ${mood.brightest.day} averages ${mood.brightest.mean} and ${mood.heaviest.day} ${mood.heaviest.mean}.`
    )
  }

  return { heading: 'The mood line', body: parts.join(' ') }
}

function habitSection(habits) {
  if (!habits.active) return null

  const parts = [
    `${pluralise(habits.active, 'habit')} on the register${
      habits.overallRate != null ? `, kept ${PERCENT(habits.overallRate)} of the days they have existed` : ''
    }.`,
  ]

  if (habits.strongest && habits.strongest.rate > 0) {
    parts.push(
      `“${habits.strongest.name}” is the most consistent at ${PERCENT(habits.strongest.rate)}${
        habits.strongest.streak > 1 ? `, currently ${pluralise(habits.strongest.streak, 'day')} unbroken` : ''
      }.`
    )
  }

  if (habits.weakest && habits.weakest.rate < 0.34) {
    parts.push(
      `“${habits.weakest.name}” is the one slipping, ticked on ${PERCENT(habits.weakest.rate)} of its days.`
    )
  }

  if (habits.longestStreak >= 7) {
    parts.push(`The longest run standing right now is ${pluralise(habits.longestStreak, 'day')}.`)
  }

  return { heading: 'The register', body: parts.join(' ') }
}

function thoughtSection(thoughts) {
  if (!thoughts.count) return null

  const parts = [
    `${pluralise(thoughts.count, 'record')} written${
      thoughts.perWeek ? `, about ${thoughts.perWeek} a week` : ''
    }.`,
  ]

  // An emotion named once is not a recurring one, however high it sorts.
  const repeated = thoughts.emotions.find((e) => e.count >= 2)
  if (repeated) {
    parts.push(
      `The emotion named most often is “${repeated.name}” (${pluralise(repeated.count, 'time')}${
        repeated.meanIntensity != null ? `, averaging ${repeated.meanIntensity}/10` : ''
      }).`
    )
  } else if (thoughts.emotions.length) {
    parts.push(
      `${pluralise(thoughts.emotions.length, 'emotion')} named so far, none of them twice — no pattern to read yet.`
    )
  }

  if (thoughts.intensityTrend) {
    const t = thoughts.intensityTrend
    const tenth = (v) => Number(v).toFixed(1)
    parts.push(
      t.direction === 'steady'
        ? `Recorded intensity has held steady around ${tenth(t.recent)}/10.`
        : `Recorded intensity has moved from ${tenth(t.earlier)}/10 to ${tenth(t.recent)}/10 across the run.`
    )
  }

  if (thoughts.reframeRate != null) {
    parts.push(
      thoughts.reframeRate >= 0.75
        ? `${PERCENT(thoughts.reframeRate)} of the records reach a balanced thought — the form is being finished, not just started.`
        : `${PERCENT(thoughts.reframeRate)} of the records reach a balanced thought; the rest stop at the automatic one.`
    )
  }

  return { heading: 'The case notes', body: parts.join(' ') }
}

function linkSection(links) {
  const found = [links.habitDays, links.thoughtDays].filter(Boolean)
  if (!found.length) return null

  const parts = found.map((link) => {
    const higher = link.delta > 0
    const size = Math.abs(link.delta)
    if (size < 0.2) {
      return `Mood on ${link.label} (${link.withMean}) is level with ${link.against} (${link.withoutMean}).`
    }
    return `Mood on ${link.label} averages ${link.withMean} against ${link.withoutMean} on ${link.against} — ${higher ? 'higher' : 'lower'} by ${size}, over ${link.withDays} and ${link.withoutDays} days.`
  })

  parts.push(
    'These are two columns lining up on the same dates, not a cause. Which way round it runs is the interesting question, and only you can answer it.'
  )

  return { heading: 'Where the columns meet', body: parts.join(' ') }
}

function buildNoticed(insights) {
  const { mood, habits, thoughts, links } = insights
  const noticed = []

  if (mood.streak >= 3) noticed.push(`Mood logged ${pluralise(mood.streak, 'day')} running.`)
  if (mood.coverage != null && mood.count >= 5) {
    noticed.push(`${PERCENT(mood.coverage)} of the days in this stretch have a mood on them.`)
  }
  if (mood.distribution.length) {
    const top = [...mood.distribution].sort((a, b) => b.count - a.count)[0]
    if (top.count) noticed.push(`“${top.label}” is the most frequent score, ${pluralise(top.count, 'time')}.`)
  }
  if (habits.longestStreak) {
    noticed.push(`Longest habit streak standing: ${pluralise(habits.longestStreak, 'day')}.`)
  }
  if (thoughts.meanIntensity != null) {
    noticed.push(`Average recorded emotion intensity is ${thoughts.meanIntensity}/10.`)
  }
  if (links.habitDays && Math.abs(links.habitDays.delta) >= 0.2) {
    noticed.push(
      `A ${Math.abs(links.habitDays.delta)}-point mood gap between days a habit was ticked and days none was.`
    )
  }

  return noticed.slice(0, 5)
}

function buildQuestions(insights) {
  const { mood, habits, thoughts, links } = insights
  const questions = []

  if (mood.brightest && mood.heaviest && mood.brightest.day !== mood.heaviest.day) {
    questions.push(
      `What is different about a ${mood.heaviest.day} that a ${mood.brightest.day} does not have?`
    )
  }
  if (thoughts.reframeRate != null && thoughts.reframeRate < 0.6) {
    questions.push('What tends to stop you before the balanced thought — time, or not believing it yet?')
  }
  if (habits.weakest && habits.weakest.rate < 0.34) {
    questions.push(`Is “${habits.weakest.name}” still one you want on the register?`)
  }
  if (links.habitDays && links.habitDays.delta >= 0.2) {
    questions.push('On the better days, did the habit lift the mood, or did the mood make the habit easy?')
  }
  // Same threshold as the prose: only ask about an emotion that has recurred.
  const recurring = thoughts.emotions.find((e) => e.count >= 2)
  if (recurring) {
    questions.push(`Where does “${recurring.name}” usually turn up — is there a place or a time?`)
  }
  if (mood.notes === 0 && mood.count >= 5) {
    questions.push('What would a one-line note next to tomorrow’s mood have said today?')
  }

  if (questions.length < 2) {
    const busiest = [...mood.distribution].sort((a, b) => b.count - a.count)[0]
    if (busiest?.count >= 2) {
      questions.push(`“${busiest.label}” is where most days land. What does an ordinary one look like?`)
    }
    if (mood.streak >= 2) {
      questions.push('What made it easy to keep logging this week — and what usually breaks it?')
    }
  }

  return questions.slice(0, 3)
}

function buildTitle(insights) {
  const { mood, thoughts, habits } = insights
  if (mood.trend && mood.trend.direction !== 'steady') {
    return mood.trend.direction === 'rising' ? 'The line is turning up' : 'A heavier stretch'
  }
  if (mood.count >= 5 && mood.spread != null && mood.spread < 0.7) return 'A steady stretch'
  if (habits.longestStreak >= 7) return 'The register is holding'
  if (thoughts.count >= 3) return 'Notes worth rereading'
  return 'Early pages'
}

function buildSummary(insights) {
  const { totals, mood, thoughts, habits } = insights
  const written = []
  if (totals.moods) written.push(pluralise(totals.moods, 'mood entry', 'mood entries'))
  if (totals.habitLogs) written.push(`${pluralise(totals.habitLogs, 'habit tick')} across ${pluralise(habits.active, 'habit')}`)
  if (totals.thoughts) written.push(pluralise(totals.thoughts, 'thought record'))

  const opening = written.length
    ? `This report reads ${written.join(', ')}.`
    : 'There is not much on the page yet.'

  const middle =
    mood.mean != null
      ? ` The mood average sits at ${mood.mean} out of 5${
          mood.trend && mood.trend.direction !== 'steady'
            ? `, and has been ${trendWord(mood.trend)} lately`
            : ''
        }.`
      : ''

  const close =
    thoughts.reframeRate != null && thoughts.count >= 2
      ? ` ${PERCENT(thoughts.reframeRate)} of your thought records make it as far as a balanced thought.`
      : ''

  return `${opening}${middle}${close}`
}

/**
 * Writes the report from figures alone. Returns the same shape `/api/report`
 * returns, minus the `source` field, which the caller stamps on.
 */
export function writeLocalReport(insights) {
  const sections = [
    moodSection(insights.mood),
    habitSection(insights.habits),
    thoughtSection(insights.thoughts),
    linkSection(insights.links),
  ].filter(Boolean)

  return {
    title: buildTitle(insights),
    summary: buildSummary(insights),
    sections,
    noticed: buildNoticed(insights),
    questions: buildQuestions(insights),
  }
}

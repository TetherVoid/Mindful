// Deterministic sample data for local development, so the UI can be worked on
// (and judged) without a Supabase project. Three scenarios, chosen with
// VITE_FIXTURE_SCENARIO:
//
//   empty  — day one. Every list is empty. This is the hardest case for the
//            design to hold, so it's the one worth looking at most.
//   week   — a realistic week or so in. The default.
//   heavy  — a long-running account: 200+ records, deliberately long strings,
//            notes with line breaks. This is where truncation, wrapping and
//            list performance actually get tested.
//   teacher, admin — heavy, plus that role, classes and a roster with long
//            class and student names. FOR LAYOUT TESTING ONLY (the visual
//            sweep, scripts/sweep/). There is no row-level security here, so
//            these show rosters and user lists exactly as drawn, not as the
//            database would filter them; nothing about access can be learned
//            from them. See mockRpc in mockClient.js.
//
// Everything is generated from a fixed seed so two runs produce identical
// data and screenshots stay comparable.

const SEED = 20260901

// mulberry32 — small, fast, and stable across runs. Not for anything
// security-related; it exists so the sample data doesn't move under us.
function makeRandom(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function daysAgo(n, hour = 9) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 0, 0, 0)
  return d
}

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MOOD_NOTES = [
  'Slept badly, but the morning walk helped more than I expected.',
  'Good session at work — actually finished the thing I kept avoiding.',
  '',
  'Felt flat all day without any obvious reason for it.',
  'Long call with Mum. Left it feeling lighter.',
  '',
  'Deadline moved up again. Trying not to catastrophise about it.',
  'Quiet day. Nothing much happened, which was the point.',
]

const HABIT_NAMES = [
  'Ten minutes of quiet',
  'Walk before noon',
  'Read twenty pages',
  'No screens after ten',
  'Write one paragraph',
]

const SITUATIONS = [
  'Presentation ran over and I lost my thread',
  "Didn't hear back about the flat",
  'Snapped at a friend over nothing',
  'Got a short reply to a long message',
  'Missed the gym for the third day running',
  'Manager asked for "a quick chat" with no agenda',
]

const THOUGHTS = [
  "Everyone could tell I hadn't prepared.",
  "They've picked someone else and nobody wants to tell me.",
  "I'm the difficult one in every group I'm in.",
  "I've annoyed them and they're being polite about it.",
  'I always start things and never keep them going.',
  "Something's wrong and I'm the last to know.",
]

const EVIDENCE_AGAINST = [
  'Two people asked follow-up questions, which they don’t do when a talk lands badly.',
  'The agent said Thursday, and it is Tuesday.',
  'They messaged first the next morning about something unrelated.',
  'They were on a train — short replies all week, to everyone.',
  'I went four times the week before, which is more than I managed all of last month.',
  'The last three "quick chats" were about scheduling.',
]

const BALANCED = [
  'It went less smoothly than I wanted, and it still did the job it needed to do.',
  "Not hearing back before the date they gave me isn't news, it's just waiting.",
  'One sharp reply in a long friendship is a bad moment, not a verdict on me.',
  'A short reply is information about their day, not about how they feel about me.',
  'Three missed days after a good week is a dip, not a collapse.',
  "I don't have enough information yet to be frightened of this.",
]

const EMOTIONS = ['anxious', 'embarrassed', 'flat', 'restless', 'frustrated', 'uneasy']

// The long-string torture test: a situation that runs to a paragraph, a habit
// name nobody would sensibly type, and a note with hard line breaks.
const LONG_SITUATION =
  'Team retro overran by forty minutes and when it got to my section the room had visibly checked out — two people were on laptops, one had joined from a car — and I rushed the part I had actually prepared properly in order to give everyone their time back, which meant the one piece of work I was proud of this quarter went past in about ninety seconds with no questions afterwards.'
const LONG_HABIT =
  'Twenty minutes of unstructured reading that is not the news and not anything work-adjacent'
const MULTILINE_NOTE =
  'Better than yesterday.\n\nStill waking at four, but got back to sleep, which has not been happening.\n\nWorth mentioning on Thursday.'

function buildScenario(name) {
  const random = makeRandom(SEED)
  const moodLogs = []
  const habits = []
  const habitLogs = []
  const thoughtRecords = []

  if (name === 'empty') {
    return { moodLogs, habits, habitLogs, thoughtRecords }
  }

  const heavy = name === 'heavy' || name === 'teacher' || name === 'admin'
  const moodDays = heavy ? 240 : 11
  const habitCount = heavy ? 5 : 3
  const recordCount = heavy ? 214 : 4

  // --- moods ---------------------------------------------------------
  for (let i = moodDays - 1; i >= 0; i--) {
    // A slow drift plus noise, so the trend line has shape instead of jitter.
    const drift = Math.sin((moodDays - i) / 9) * 1.1
    const score = Math.max(1, Math.min(5, Math.round(3 + drift + (random() - 0.5) * 1.6)))
    const note =
      heavy && i % 17 === 0 ? MULTILINE_NOTE : MOOD_NOTES[Math.floor(random() * MOOD_NOTES.length)]
    moodLogs.push({
      id: `mood-${i}`,
      user_id: 'local-user',
      mood_score: score,
      note,
      created_at: daysAgo(i, 20).toISOString(),
    })
  }

  // --- habits + their check-ins ---------------------------------------
  for (let h = 0; h < habitCount; h++) {
    const id = `habit-${h}`
    habits.push({
      id,
      user_id: 'local-user',
      name: heavy && h === 0 ? LONG_HABIT : HABIT_NAMES[h],
      archived: false,
      created_at: daysAgo(heavy ? 200 : 30).toISOString(),
    })

    // Each habit gets its own stickiness, so streaks differ and the heatmap
    // has contrast instead of a uniform block.
    const stickiness = 0.5 + h * 0.12
    const span = heavy ? 170 : 26
    for (let d = span; d >= 0; d--) {
      // Habit 0 is deliberately unbroken to the present, so there's always one
      // long streak to look at; habit 2 is deliberately broken today.
      const forced = h === 0 && d < 18
      const skipToday = h === 2 && d === 0
      if (skipToday) continue
      if (forced || random() < stickiness) {
        habitLogs.push({
          id: `hl-${h}-${d}`,
          habit_id: id,
          user_id: 'local-user',
          date: isoDate(daysAgo(d)),
        })
      }
    }
  }

  // --- thought records --------------------------------------------------
  for (let r = 0; r < recordCount; r++) {
    const pick = r % SITUATIONS.length
    thoughtRecords.push({
      id: `tr-${r}`,
      user_id: 'local-user',
      situation: heavy && r % 11 === 0 ? LONG_SITUATION : SITUATIONS[pick],
      automatic_thought: THOUGHTS[pick],
      emotion: EMOTIONS[pick],
      emotion_intensity: 3 + Math.floor(random() * 7),
      evidence_for: 'It has happened before and I remember how that felt.',
      evidence_against: EVIDENCE_AGAINST[pick],
      // Some records are left unfinished on purpose — people abandon these
      // halfway, and the card has to look right when they do.
      balanced_thought: r % 5 === 3 ? '' : BALANCED[pick],
      created_at: daysAgo(heavy ? r : r * 3, 18).toISOString(),
    })
  }

  return { moodLogs, habits, habitLogs, thoughtRecords }
}

export const SCENARIOS = ['empty', 'week', 'heavy', 'teacher', 'admin']
export const ROLE_SCENARIOS = ['teacher', 'admin']

// The signed-in fixture user. Kept here rather than in mockClient because the
// profiles row and the auth user have to agree on an id, and one of them has to
// own that fact.
export const FIXTURE_USER_ID = 'local-user'

export function buildFixtureTables(scenario) {
  const name = SCENARIOS.includes(scenario) ? scenario : 'week'
  const { moodLogs, habits, habitLogs, thoughtRecords } = buildScenario(name)
  return {
    mood_logs: moodLogs,
    habits,
    habit_logs: habitLogs,
    thought_records: thoughtRecords,
    // A student, with no classes. Roles and classes are an authorisation
    // feature, and authorisation is the one thing fixtures cannot honestly
    // stand in for — there is no row-level security here to enforce any of it.
    // A fixture teacher would show a roster that the real database would refuse
    // to return, which is worse than showing nothing. See mockClient's rpc().
    profiles: [
      {
        id: FIXTURE_USER_ID,
        role: ROLE_SCENARIOS.includes(name) ? name : 'student',
        display_name: 'Sam',
        share_with_teachers: true,
        deactivated_at: null,
        created_at: daysAgo(120).toISOString(),
      },
    ],
    ...(ROLE_SCENARIOS.includes(name) ? buildRoleTables() : { classes: [], class_teachers: [], class_members: [], role_change_audit: [] }),
  }
}

// Layout-testing data for the teacher and admin scenarios: long class names
// (one with no spaces), long student names, students who do and do not share
// figures, an archived class, and an audit trail.
const LONG_CLASS = 'Year 11 Personal, Social, Health and Economic Education — Thursday afternoon group'
const UNBROKEN_CLASS = 'Wellbeing-and-Mindfulness-Elective-Semester-Two-Combined-Cohort'
const STUDENT_NAMES = [
  'Aanya',
  'Maximilian Alexander Featherstonehaugh-Wolstenholme',
  'Priyanka Venkataraghavan',
  null,
  'Jo',
  'Oluwaseyifunmi Adebayo-Ogunleye',
  'Krishnamurthy-Subramaniam-Ramachandran',
  'Li Wei',
]

function buildRoleTables() {
  const classes = [
    { id: 'class-1', name: LONG_CLASS, join_code: 'K7Q2-9XMB', owner_id: FIXTURE_USER_ID, archived: false, created_at: daysAgo(90).toISOString() },
    { id: 'class-2', name: UNBROKEN_CLASS, join_code: 'P3RZ-4LWT', owner_id: FIXTURE_USER_ID, archived: false, created_at: daysAgo(60).toISOString() },
    { id: 'class-3', name: '9C', join_code: 'M8DV-2HJN', owner_id: FIXTURE_USER_ID, archived: true, created_at: daysAgo(200).toISOString() },
  ]
  const students = STUDENT_NAMES.map((display_name, i) => ({
    id: `student-${i + 1}`,
    role: 'student',
    display_name,
    email: display_name ? `${display_name.toLowerCase().replace(/[^a-z]+/g, '.')}@pupils.example-school-district.edu` : `student${i + 1}@example.edu`,
    share_with_teachers: i % 3 !== 2,
    deactivated_at: i === 6 ? daysAgo(5).toISOString() : null,
    created_at: daysAgo(100 - i).toISOString(),
  }))
  return {
    classes,
    class_teachers: classes.map((c) => ({ class_id: c.id, user_id: FIXTURE_USER_ID, added_by: FIXTURE_USER_ID, created_at: c.created_at })),
    class_members: students.flatMap((st, i) => [{ class_id: 'class-1', user_id: st.id, joined_at: st.created_at }, ...(i < 3 ? [{ class_id: 'class-2', user_id: st.id, joined_at: st.created_at }] : [])]),
    role_change_audit: [
      { id: 'audit-1', target_user_id: 'student-2', previous_role: 'student', new_role: 'teacher', changed_by: FIXTURE_USER_ID, reason: 'Covering the Thursday group while Ms Featherstonehaugh-Wolstenholme is on leave for the rest of term', created_at: daysAgo(12).toISOString() },
      { id: 'audit-2', target_user_id: 'student-2', previous_role: 'teacher', new_role: 'student', changed_by: FIXTURE_USER_ID, reason: null, created_at: daysAgo(3).toISOString() },
    ],
    // Extra people the admin directory and the rosters read. Not profiles rows,
    // so the signed-in user's my_profile() still returns exactly one row.
    fixture_people: students,
  }
}

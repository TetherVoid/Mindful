// The mood scale, defined once.
//
// Previously this table was written out separately in Dashboard.jsx, Mood.jsx
// and insights.js — three copies of the same five labels that could drift apart.
export const MOOD_SCORES = [1, 2, 3, 4, 5]

export const MOOD_LABELS = {
  1: 'Awful',
  2: 'Low',
  3: 'Even',
  4: 'Good',
  5: 'Bright',
}

export const MOODS = MOOD_SCORES.map((score) => ({ score, label: MOOD_LABELS[score] }))

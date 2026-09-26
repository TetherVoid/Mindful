// What text may appear in the figures /api/report forwards to Anthropic.
//
// The rule is that nothing a student typed leaves their device. The browser
// enforces it by replacing habit names and emotion words with numbered labels
// before sending (anonymiseForReport in src/backend/services/report/
// insights.js). This is the second half: the server refuses to forward any
// string it does not recognise as one the app itself generates, so a bug — or a
// hand-built request — cannot put a student's words into a prompt.
//
// Numbers and booleans pass freely: they are the figures. Strings must be one
// of the fixed labels below. Keys must look like identifiers. Anything else,
// and the request is refused before a model is called.
//
// When insights.js gains a new text field, it has to be added here as well, or
// the reading falls back to being written in the browser — the safe failure.

const EXACT = new Set([
  // Mood labels
  'Awful', 'Low', 'Even', 'Good', 'Bright',
  // Weekdays
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
  // Trend directions and which way is better
  'rising', 'falling', 'steady', 'up', 'down',
  // Comparison labels from analyseLinks()
  'days a habit was ticked', 'days a thought record was written', 'days none was',
])

const PATTERNS = [
  /^\d{4}-\d{2}-\d{2}$/, // ISO dates
  /^Habit \d{1,3}$/,
  /^Emotion \d{1,3}$/,
]

const KEY = /^[A-Za-z][A-Za-z0-9]{0,39}$/
const MAX_DEPTH = 8

function allowedString(value) {
  return EXACT.has(value) || PATTERNS.some((p) => p.test(value))
}

/**
 * Returns the path of the first thing in `figures` that is not allowed, or
 * null if everything is. The path is safe to log; the value is not returned,
 * because it may be exactly the text that must not be written anywhere.
 */
export function findDisallowedText(figures, path = 'figures', depth = 0) {
  if (depth > MAX_DEPTH) return path
  if (figures === null || typeof figures === 'number' || typeof figures === 'boolean') return null
  if (typeof figures === 'string') return allowedString(figures) ? null : path
  if (Array.isArray(figures)) {
    for (let i = 0; i < figures.length; i += 1) {
      const bad = findDisallowedText(figures[i], `${path}[${i}]`, depth + 1)
      if (bad) return bad
    }
    return null
  }
  if (typeof figures === 'object') {
    for (const [key, value] of Object.entries(figures)) {
      if (!KEY.test(key)) return `${path}.<key>`
      const bad = findDisallowedText(value, `${path}.${key}`, depth + 1)
      if (bad) return bad
    }
    return null
  }
  return path
}

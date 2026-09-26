// Puts a student's own names back into a reading written from anonymised
// figures. The model only ever saw "Habit 2" and "Emotion 1"; `labels` maps
// those back to the names the student gave them, and was built in this
// browser by anonymiseForReport() and never sent anywhere.
//
// Kept apart from client.js so it has no dependencies and can be tested alone.

const LABEL = /\b(Habit|Emotion) (\d{1,3})\b/gi

function swap(text, labels) {
  if (typeof text !== 'string') return text
  return text.replace(LABEL, (match, kind, n) => {
    const key = `${kind[0].toUpperCase()}${kind.slice(1).toLowerCase()} ${n}`
    return labels[key] ? `“${labels[key]}”` : match
  })
}

export function restoreNames(report, labels) {
  if (!report) return report
  return {
    ...report,
    title: swap(report.title, labels),
    summary: swap(report.summary, labels),
    sections: (report.sections ?? []).map((s) => ({
      ...s,
      heading: swap(s.heading, labels),
      body: swap(s.body, labels),
    })),
    noticed: (report.noticed ?? []).map((t) => swap(t, labels)),
    questions: (report.questions ?? []).map((t) => swap(t, labels)),
  }
}

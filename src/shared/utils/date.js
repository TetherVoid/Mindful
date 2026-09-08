// Local calendar date, not UTC — using toISOString() directly shifts the
// "today" a date gets attributed to for anyone west of UTC in the evening.
export function toLocalISODate(date) {
  const offsetMs = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10)
}

export function todayISO() {
  return toLocalISODate(new Date())
}

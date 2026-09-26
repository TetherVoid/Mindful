import { Link } from 'react-router-dom'

// One observation, set as a note in the margin: the sentence, then what it
// rests on in small type underneath. Observations come from
// backend/services/report/observations.js, which decides what may be said;
// this only prints it. Pass `kicker={null}` for the second of a pair, so the
// heading is printed once.
export default function MarginNote({ observation, kicker = 'Marked in the margin', showReadingLink = false }) {
  if (!observation) return null
  return (
    <aside className="margin-note" aria-label={kicker ?? 'Observation'}>
      {kicker && <p className="margin-note-kicker">{kicker}</p>}
      <p className="margin-note-text">{observation.text}</p>
      <p className="margin-note-basis">
        {observation.basis}
        {showReadingLink && (
          <>
            {' · '}
            <Link to="/report">The whole reading</Link>
          </>
        )}
      </p>
    </aside>
  )
}

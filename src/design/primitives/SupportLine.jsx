import { Fragment } from 'react'
import { SUPPORT_LINES } from '@shared/constants/support'

// "Need to talk to someone now?" — printed on every page, the same for every
// reader. It is never shown conditionally: see shared/constants/support.js for
// why nothing in the app decides who needs it.
//
// Set in readable type rather than the colophon's small capitals. Everything
// else at the foot of the page is printer's detail; this is the one line
// somebody might need to read quickly.
//
// A service's name and number never split across lines; everything else —
// the notes, and the separators between services — may wrap, so the line
// reflows on a narrow screen instead of running off its edge.
export default function SupportLine({ className = '' }) {
  return (
    <p className={`support-line ${className}`.trim()}>
      <span className="support-line-lead">Need to talk to someone now?</span>{' '}
      {SUPPORT_LINES.map((line, i) => (
        <Fragment key={line.id}>
          {i > 0 && (
            <span className="support-line-sep" aria-hidden="true">
              {' · '}
            </span>
          )}
          <span className="support-line-item">
            <span className="support-line-call">
              {line.name}{' '}
              <a href={`tel:${line.dial}`} aria-label={`Call ${line.name} on ${line.number}, ${line.note}`}>
                {line.number}
              </a>
            </span>{' '}
            <span className="support-line-note">({line.note})</span>
          </span>
        </Fragment>
      ))}
    </p>
  )
}

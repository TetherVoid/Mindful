import { lazy, Suspense, useState } from 'react'
import SilentErrorBoundary from './SilentErrorBoundary'
import GridField from './GridField'
import Reveal from './Reveal'

const AmbientScene = lazy(() => import('./AmbientScene'))
const MOBILE_BREAKPOINT = 720

// One-time check, not a resize listener — a pointer-parallax figure adds
// nothing on a touchscreen and isn't worth the WebGL context + chunk fetch
// there.
function isWideViewport() {
  return window.innerWidth >= MOBILE_BREAKPOINT
}

const CONTENTS = [
  { n: 'I', label: 'A mood, logged in five seconds' },
  { n: 'II', label: 'Habits kept on a printed register' },
  { n: 'III', label: 'Thoughts examined, then rebalanced' },
]

// The opening spread of the book: a title page on the left, the plate the
// reader signs on the right.
export default function Frontispiece({ children }) {
  const [showScene] = useState(isWideViewport)

  return (
    <div className="frontispiece">
      <GridField variant="auth" />

      <section className="frontispiece-left">
        {showScene && (
          <div className="ambient-scene-wrapper">
            <SilentErrorBoundary>
              <Suspense fallback={null}>
                <AmbientScene />
              </Suspense>
            </SilentErrorBoundary>
          </div>
        )}

        <div className="frontispiece-masthead">
          <span>Mindful</span>
          <span>Vol. I — The Almanac</span>
        </div>

        <Reveal className="frontispiece-copy" y={18} index={0}>
          <h1 className="frontispiece-title">
            Keep a quiet <em>record</em> of yourself.
          </h1>
          <p className="frontispiece-lede">
            Not a feed, not a score. A logbook — mood, habits, and the thoughts worth arguing
            with — kept privately and read back to you in your own words.
          </p>
          <ul className="frontispiece-contents">
            {CONTENTS.map((entry) => (
              <li key={entry.n}>
                <b>{entry.n}</b>
                <span>{entry.label}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <p className="frontispiece-foot">Private by default · Row-level security · Yours to export</p>
      </section>

      <section className="frontispiece-right">{children}</section>
    </div>
  )
}

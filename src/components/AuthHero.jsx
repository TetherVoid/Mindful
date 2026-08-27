import { lazy, Suspense, useState } from 'react'
import SilentErrorBoundary from './SilentErrorBoundary'
import AuroraBackground from './AuroraBackground'
import Reveal from './Reveal'

const AmbientScene = lazy(() => import('./AmbientScene'))
const MOBILE_BREAKPOINT = 640

// One-time check, not a resize listener — a pointer-parallax scene adds
// nothing on a touchscreen and isn't worth the WebGL context + chunk fetch
// there.
function isWideViewport() {
  return window.innerWidth >= MOBILE_BREAKPOINT
}

export default function AuthHero({ children }) {
  const [showScene] = useState(isWideViewport)

  return (
    <div className="auth-page">
      <AuroraBackground variant="auth" />
      {showScene && (
        <div className="ambient-scene-wrapper" aria-hidden="true">
          <SilentErrorBoundary>
            <Suspense fallback={null}>
              <AmbientScene />
            </Suspense>
          </SilentErrorBoundary>
        </div>
      )}
      <Reveal className="auth-hero-copy" y={16}>
        <span className="auth-hero-kicker">Mindful</span>
        <h1>A calmer way to check in with yourself.</h1>
        <p>Track your mood, build habits that stick, and work through your thoughts — all in one quiet place.</p>
      </Reveal>
      {children}
    </div>
  )
}

import { lazy, Suspense, useState } from 'react'
import SilentErrorBoundary from './SilentErrorBoundary'

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
      {showScene && (
        <div className="ambient-scene-wrapper" aria-hidden="true">
          <SilentErrorBoundary>
            <Suspense fallback={null}>
              <AmbientScene />
            </Suspense>
          </SilentErrorBoundary>
        </div>
      )}
      {children}
    </div>
  )
}

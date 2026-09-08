import { useEffect, useState } from 'react'
import { useTheme } from './ThemeContext'

// Combines the app's own "Reduce motion" setting (Settings page) with the
// OS-level prefers-reduced-motion query — motion/react's JS-driven
// animations don't go through CSS transitions, so they aren't caught by the
// blanket animation-duration override in index.css and need this explicit
// check instead.
export default function useReducedMotionPref() {
  const { reduceMotion } = useTheme()
  const [systemReduced, setSystemReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    function update() {
      setSystemReduced(mq.matches)
    }
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return reduceMotion || systemReduced
}

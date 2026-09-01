import { useEffect, useRef, useState } from 'react'
import { useInView } from 'motion/react'

// How long to wait for the viewport observer before showing the content
// anyway. Long enough that a normal scroll-triggered reveal always wins the
// race; short enough that a reader never sits looking at a blank page.
const FALLBACK_MS = 1400

// Drives every scroll reveal in the app.
//
// The important part is the fallback. A reveal that starts at opacity 0 and
// depends on an IntersectionObserver callback to become visible has a failure
// mode where the content is hidden *permanently* — the observer never fires
// (a throttled or backgrounded tab, an environment where IO is unavailable)
// and the page renders blank with no error. Content should never be one
// missing callback away from invisible, so a timer shows it regardless.
export default function useRevealed({ margin = '-60px' } = {}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin })
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (inView) return undefined
    const timer = setTimeout(() => setTimedOut(true), FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [inView])

  return [ref, inView || timedOut]
}

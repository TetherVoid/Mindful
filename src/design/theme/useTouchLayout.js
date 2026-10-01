import { useEffect, useState } from 'react'

// The touch layout, as JavaScript sees it. Same query as the touch-target
// block at the end of styles/parts/23-responsive.css; change them together.
export const TOUCH_QUERY = '(pointer: coarse), (max-width: 768px)'

export default function useTouchLayout() {
  const [touch, setTouch] = useState(() => window.matchMedia(TOUCH_QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(TOUCH_QUERY)
    function update() {
      setTouch(mq.matches)
    }
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return touch
}

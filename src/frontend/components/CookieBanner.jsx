import { useEffect, useRef, useState } from 'react'
import { getConsent, applyConsentChoice } from '@backend/utils/consent'

// The notice is fixed to the bottom-left corner, which is exactly where the
// colophon — and the support line in it — sits once the page is scrolled to
// the end. While the notice is showing, its height is published as
// --notice-clearance and the colophon keeps that much room below it (see
// 25-support-line.css), so the support line can always be scrolled clear of
// the notice. Nothing is left behind once it is dismissed.
const CLEARANCE_VAR = '--notice-clearance'

export default function CookieBanner() {
  const [visible, setVisible] = useState(() => !getConsent())
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    const root = document.documentElement
    if (!visible || !el) return undefined

    function publish() {
      // Its height plus the gap it sits above the bottom edge.
      const gap = window.innerHeight - el.getBoundingClientRect().bottom
      root.style.setProperty(CLEARANCE_VAR, `${Math.ceil(el.offsetHeight + Math.max(gap, 0))}px`)
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    window.addEventListener('resize', publish)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', publish)
      root.style.removeProperty(CLEARANCE_VAR)
    }
  }, [visible])

  function dismiss(choice) {
    applyConsentChoice(choice)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-notice" role="dialog" aria-label="Storage notice" ref={ref}>
      <p className="mono" style={{ color: 'var(--accent)', margin: 0 }}>
        Notice — local storage
      </p>
      <p>
        This book keeps a few things on your device — your theme, your density, and your signed-in
        session. Nothing is sold, shared, or used to follow you elsewhere.
      </p>
      <div className="cookie-actions">
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => dismiss('declined')}>
          Decline
        </button>
        <button type="button" className="btn btn--ink btn--sm" onClick={() => dismiss('accepted')}>
          Understood
        </button>
      </div>
    </div>
  )
}

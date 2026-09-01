import { useState } from 'react'
import { getConsent, applyConsentChoice } from '../lib/consent'

export default function CookieBanner() {
  const [visible, setVisible] = useState(() => !getConsent())

  function dismiss(choice) {
    applyConsentChoice(choice)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-notice" role="dialog" aria-label="Storage notice">
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

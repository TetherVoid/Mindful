import { useState } from 'react'
import { getConsent, setConsent } from '../lib/consent'
import { clearStoredUtm } from '../lib/utm'

export default function CookieBanner() {
  const [visible, setVisible] = useState(() => !getConsent())

  function dismiss(choice) {
    setConsent(choice)
    // UTM capture runs at app boot, before this banner can be dismissed, so
    // declining here also undoes whatever it already wrote.
    if (choice === 'declined') clearStoredUtm()
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie notice">
      <p>
        This site stores a few things locally (like your theme and login session) to make the
        app work.
      </p>
      <div className="cookie-actions">
        <button type="button" className="btn-ghost" onClick={() => dismiss('declined')}>
          Decline
        </button>
        <button type="button" className="btn-primary" onClick={() => dismiss('accepted')}>
          Got it
        </button>
      </div>
    </div>
  )
}

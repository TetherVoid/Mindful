import { useState } from 'react'

const STORAGE_KEY = 'cookie_consent'

export default function CookieBanner() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY))

  function dismiss(choice) {
    localStorage.setItem(STORAGE_KEY, choice)
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

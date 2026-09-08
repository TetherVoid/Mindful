import { useEffect, useState } from 'react'
import Icon from './Icon'

// The two floating utilities now share one stacked dock instead of hovering
// as separate circles — a single object in the corner rather than two.
export default function Dock() {
  const [scrolled, setScrolled] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 400)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <div className="dock">
        {scrolled && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Back to the top of the page"
          >
            <Icon name="arrowUp" size={17} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={() => setContactOpen(true)}
          aria-label="Get in touch"
        >
          <Icon name="mail" size={17} />
        </button>
      </div>

      {contactOpen && (
        <div className="overlay" onClick={() => setContactOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Get in touch"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <span>Correspondence</span>
              <span>Reply expected</span>
            </div>
            <div className="sheet-body">
              <h2>Write to the editor</h2>
              <p>Questions, corrections, or anything that felt wrong in the app.</p>
              <a className="btn btn--solid btn--block" href="mailto:you@example.com" style={{ marginTop: '1.25rem' }}>
                you@example.com
              </a>
            </div>
            <div className="sheet-actions">
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => setContactOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

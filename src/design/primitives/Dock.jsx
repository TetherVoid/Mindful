import { useEffect, useState } from 'react'
import Icon from './Icon'

// The two floating utilities share one stacked dock in the corner.
//
// It is sticky, not fixed, and the layout places it at the end of the page body,
// just before the colophon: it floats in the corner while the page scrolls, then
// stops above the footer and rides up with it. So it can never sit over the
// support line, and at the end of the page it takes its own room instead of
// covering the last of the content. On phones the ✉ button is hidden (CSS);
// the colophon carries "Get in touch" instead.
export default function Dock({ onContact }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 400)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
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
      <button type="button" className="icon-btn dock-contact" onClick={onContact} aria-label="Get in touch">
        <Icon name="mail" size={17} />
      </button>
    </div>
  )
}

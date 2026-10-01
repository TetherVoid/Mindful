import { useState } from 'react'
import { Link } from 'react-router-dom'
import IndexRail from '@frontend/components/IndexRail'
import Colophon from '@design/primitives/Colophon'
import SkipToContent from '@design/primitives/SkipToContent'
import ScrollProgressBar from '@design/primitives/ScrollProgressBar'
import Dock from '@design/primitives/Dock'
import ContactSheet from '@design/primitives/ContactSheet'
import CookieBanner from '@frontend/components/CookieBanner'
import SearchOverlay from '@frontend/components/SearchOverlay'
import GridField from '@design/primitives/GridField'
import Icon from '@design/primitives/Icon'

// The running head printed at the top of every page: today's date on the
// left, the volume on the right, tools at the end.
function runningHead() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Phones get the short form: the long one cannot fit beside the masthead's
// two buttons and was cut to "THURSDAY, 1 OCTO…".
function shortRunningHead() {
  return new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AppLayout({ children }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)

  return (
    <>
      <SkipToContent />
      <ScrollProgressBar />
      <GridField />

      <div className="almanac">
        <IndexRail
          onSearchClick={() => setSearchOpen(true)}
          mobileOpen={railOpen}
          onMobileClose={() => setRailOpen(false)}
        />

        <div className="content">
          <header className="masthead">
            <button
              type="button"
              className="icon-btn menu-toggle"
              onClick={() => setRailOpen(true)}
              aria-label="Open index"
            >
              <Icon name="menu" size={17} />
            </button>
            <Link to="/dashboard" className="masthead-mark">
              Mindful
            </Link>
            <p className="masthead-slug">
              <b className="masthead-date-long">{runningHead()}</b>
              <b className="masthead-date-short">{shortRunningHead()}</b>
              <span className="masthead-vol"> · Vol. I</span>
            </p>
            <div className="masthead-tools">
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
              >
                <Icon name="search" size={16} />
              </button>
            </div>
          </header>

          {/* The dock lives at the end of the page body so it stops above the
              colophon; see Dock.jsx. */}
          <div className="page-body">
            <main id="main-content">{children}</main>
            <Dock onContact={() => setContactOpen(true)} />
          </div>
          <Colophon onContact={() => setContactOpen(true)} />
        </div>
      </div>

      <ContactSheet open={contactOpen} onClose={() => setContactOpen(false)} />
      <CookieBanner />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}

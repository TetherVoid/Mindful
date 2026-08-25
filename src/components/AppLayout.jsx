import { useState } from 'react'
import Sidebar from './Sidebar'
import Footer from './Footer'
import SkipToContent from './SkipToContent'
import ScrollProgressBar from './ScrollProgressBar'
import ScrollToTopButton from './ScrollToTopButton'
import CookieBanner from './CookieBanner'
import FloatingContactButton from './FloatingContactButton'
import SearchOverlay from './SearchOverlay'
import AuroraBackground from './AuroraBackground'

export default function AppLayout({ children }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <>
      <SkipToContent />
      <ScrollProgressBar />
      <AuroraBackground />
      <div className="app-shell">
        <Sidebar
          onSearchClick={() => setSearchOpen(true)}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <div className="content-area">
          <div className="content-topbar">
            <button
              type="button"
              className="menu-toggle"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="brand">Mindful</span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
            >
              🔍
            </button>
          </div>
          <main id="main-content">{children}</main>
          <Footer />
        </div>
      </div>
      <ScrollToTopButton />
      <CookieBanner />
      <FloatingContactButton />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}

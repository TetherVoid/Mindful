import { useState } from 'react'
import NavBar from './NavBar'
import Footer from './Footer'
import SkipToContent from './SkipToContent'
import ScrollProgressBar from './ScrollProgressBar'
import ScrollToTopButton from './ScrollToTopButton'
import CookieBanner from './CookieBanner'
import FloatingContactButton from './FloatingContactButton'
import SearchOverlay from './SearchOverlay'

export default function AppLayout({ children }) {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <>
      <SkipToContent />
      <ScrollProgressBar />
      <NavBar onSearchClick={() => setSearchOpen(true)} />
      <main id="main-content">{children}</main>
      <Footer />
      <ScrollToTopButton />
      <CookieBanner />
      <FloatingContactButton />
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}

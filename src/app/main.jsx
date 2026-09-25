import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { captureUtmParams } from '@backend/utils/utm'
import ErrorBoundary from '@frontend/components/ErrorBoundary'
import { reloadOnce } from '@frontend/components/chunkReload'
import Providers from './providers'
import App from './App'

// One stylesheet import for the whole app. @design/styles/index.css pulls in
// tokens, base, the component parts and print, in that order.
import '@design/styles/index.css'

captureUtmParams()

// Vite fires this when a lazy page's preloaded dependencies fail to load —
// usually because a deploy replaced the hashed files this tab knows about.
// Reload once to pick up the new edition. If that already happened moments ago,
// let the error through to the page's boundary instead of looping.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault()
})

// The root boundary sits outside the providers, so a failure in the router,
// the theme or the auth context still produces a page rather than a blank one.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary level="root">
      <Providers>
        <App />
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
)

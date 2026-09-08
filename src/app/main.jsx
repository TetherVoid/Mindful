import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { captureUtmParams } from '@backend/utils/utm'
import Providers from './providers'
import App from './App'

// One stylesheet import for the whole app. @design/styles/index.css pulls in
// tokens, base, the component parts and print, in that order.
import '@design/styles/index.css'

captureUtmParams()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
)

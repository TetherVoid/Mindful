import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@backend/auth/AuthContext'
import { ThemeProvider } from '@design/theme/ThemeContext'

// The provider stack, extracted from main.jsx so that adding or reordering a
// context is a change to a five-line file rather than to the render root.
//
// Ordering is load-bearing: ThemeProvider sits outside AuthProvider so the
// paper/ink palette is applied before anything auth-gated paints, and a signed-
// out visitor still gets their chosen theme on the sign-in page.
//
// This file is the seam where the design, backend and app layers meet, which
// is exactly why it does nothing else. See AGENT_RULES.md § 3.
export default function Providers({ children }) {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}

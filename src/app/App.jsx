import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@backend/auth/AuthContext'
import ProtectedRoute from '@frontend/layouts/ProtectedRoute'
import AppLayout from '@frontend/layouts/AppLayout'
import GridField from '@design/primitives/GridField'
import SkipToContent from '@design/primitives/SkipToContent'
import Colophon from '@design/primitives/Colophon'
import Login from '@frontend/pages/Login'
import Signup from '@frontend/pages/Signup'
import FAQ from '@frontend/pages/FAQ'
import NotFound from '@frontend/pages/NotFound'
import AuthCallback from '@frontend/pages/AuthCallback'

// Lazy-loaded: these are the chart/data-heavy pages behind ProtectedRoute,
// split into their own chunks so recharts etc. only load once someone's
// actually logged in and viewing them, not on the initial (public) bundle.
const Dashboard = lazy(() => import('@frontend/pages/Dashboard'))
const Mood = lazy(() => import('@frontend/pages/Mood'))
const Habits = lazy(() => import('@frontend/pages/Habits'))
const ThoughtRecords = lazy(() => import('@frontend/pages/ThoughtRecords'))
const Report = lazy(() => import('@frontend/pages/Report'))
const Settings = lazy(() => import('@frontend/pages/Settings'))
const Classes = lazy(() => import('@frontend/pages/Classes'))
const Admin = lazy(() => import('@frontend/pages/Admin'))

function AuthLoading({ label = 'Opening the book' }) {
  return <div className="page-loading" role="status" aria-live="polite">{label}</div>
}

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <AuthLoading />
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

// The administrator's page, hidden from everybody else.
//
// This is a courtesy, not a control. Every call the page makes checks
// is_admin() inside the database and raises 42501 for anyone else, so a user
// who reaches /admin another way gets a page of refusals rather than anything
// they should not see. What this avoids is offering a door that does not open.
//
// It waits on `loading` before deciding. `role` falls back to 'student' while
// the profile is in flight, so checking it any earlier would bounce an
// administrator off their own page for the moment it takes the profile to
// arrive.
function AdminOnly({ children }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return <AuthLoading />
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return children
}

function withSuspense(Component) {
  return (
    <Suspense fallback={<AuthLoading label="Setting the page" />}>
      <Component />
    </Suspense>
  )
}

function FaqRoute() {
  const { user, loading } = useAuth()
  if (loading) return <AuthLoading />
  // Signed out, the FAQ is a standalone spread with its own page furniture —
  // there's no index rail to hang it inside.
  if (!user) {
    return (
      <>
        <SkipToContent />
        <GridField />
        <main id="main-content" className="standalone">
          <FAQ />
        </main>
        <Colophon />
      </>
    )
  }
  return (
    <AppLayout>
      <FAQ />
    </AppLayout>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <Signup />
          </PublicOnly>
        }
      />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/faq" element={<FaqRoute />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={withSuspense(Dashboard)} />
        <Route path="/mood" element={withSuspense(Mood)} />
        <Route path="/habits" element={withSuspense(Habits)} />
        <Route path="/thoughts" element={withSuspense(ThoughtRecords)} />
        <Route path="/report" element={withSuspense(Report)} />
        <Route path="/settings" element={withSuspense(Settings)} />
        <Route path="/classes" element={withSuspense(Classes)} />
        <Route path="/admin" element={<AdminOnly>{withSuspense(Admin)}</AdminOnly>} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App

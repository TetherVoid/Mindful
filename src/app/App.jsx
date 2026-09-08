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

// Lazy-loaded: these are the chart/data-heavy pages behind ProtectedRoute,
// split into their own chunks so recharts etc. only load once someone's
// actually logged in and viewing them, not on the initial (public) bundle.
const Dashboard = lazy(() => import('@frontend/pages/Dashboard'))
const Mood = lazy(() => import('@frontend/pages/Mood'))
const Habits = lazy(() => import('@frontend/pages/Habits'))
const ThoughtRecords = lazy(() => import('@frontend/pages/ThoughtRecords'))
const Report = lazy(() => import('@frontend/pages/Report'))
const Settings = lazy(() => import('@frontend/pages/Settings'))

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loading">Opening the book</div>
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loading">Opening the book</div>
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

function withSuspense(Component) {
  return (
    <Suspense fallback={<div className="page-loading">Setting the page</div>}>
      <Component />
    </Suspense>
  )
}

function FaqRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loading">Opening the book</div>
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
      <Route path="/faq" element={<FaqRoute />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={withSuspense(Dashboard)} />
        <Route path="/mood" element={withSuspense(Mood)} />
        <Route path="/habits" element={withSuspense(Habits)} />
        <Route path="/thoughts" element={withSuspense(ThoughtRecords)} />
        <Route path="/report" element={withSuspense(Report)} />
        <Route path="/settings" element={withSuspense(Settings)} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

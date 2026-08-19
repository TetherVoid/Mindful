import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Mood from './pages/Mood'
import Habits from './pages/Habits'
import ThoughtRecords from './pages/ThoughtRecords'
import FAQ from './pages/FAQ'
import './App.css'

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loading">Loading…</div>
  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loading">Loading…</div>
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

function FaqRoute() {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loading">Loading…</div>
  if (!user) {
    return (
      <div className="page">
        <FAQ />
      </div>
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
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/mood" element={<Mood />} />
        <Route path="/habits" element={<Habits />} />
        <Route path="/thoughts" element={<ThoughtRecords />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

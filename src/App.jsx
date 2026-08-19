import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
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

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/mood" element={<Mood />} />
        <Route path="/habits" element={<Habits />} />
        <Route path="/thoughts" element={<ThoughtRecords />} />
        <Route path="/faq" element={<FAQ />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App

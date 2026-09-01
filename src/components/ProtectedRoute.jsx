import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import AppLayout from './AppLayout'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) return <div className="page-loading">Opening the book</div>
  if (!user) return <Navigate to="/login" replace />

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}

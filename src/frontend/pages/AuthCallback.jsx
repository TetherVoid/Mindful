import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@backend/auth/AuthContext'
import Frontispiece from '@design/primitives/Frontispiece'
import Reveal from '@design/primitives/Reveal'
import FormError from '@frontend/components/FormError'

export default function AuthCallback() {
  const { user, loading, authError } = useAuth()
  if (loading) return <Frontispiece><Reveal className="plate" index={1} y={18}><div className="plate-head"><p className="mono">Signing you in</p><h1>Opening your book</h1><p>Please wait while your secure sign-in is completed.</p></div></Reveal></Frontispiece>
  if (user) return <Navigate to="/dashboard" replace />
  return <Frontispiece><Reveal className="plate" index={1} y={18}><div className="plate-head"><p className="mono">Sign-in interrupted</p><h1>We could not open your book</h1></div><FormError message={authError ?? 'Your sign-in link is no longer valid. Please try again.'} label="Authentication" /><Link className="btn btn--solid btn--block" to="/login">Return to sign in</Link></Reveal></Frontispiece>
}

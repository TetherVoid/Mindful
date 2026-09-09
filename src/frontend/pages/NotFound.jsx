import { Link } from 'react-router-dom'
import { useAuth } from '@backend/auth/AuthContext'
import Frontispiece from '@design/primitives/Frontispiece'
import Reveal from '@design/primitives/Reveal'

export default function NotFound() {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-loading" role="status">Finding the page</div>
  const destination = user ? '/dashboard' : '/login'
  return <Frontispiece><Reveal className="plate" index={1} y={18}><div className="plate-head"><p className="mono">Error 404</p><h1>This page is not in the book</h1><p>It may have moved, or the address may be incomplete.</p></div><Link className="btn btn--solid btn--block" to={destination}>Return to {user ? 'your day sheet' : 'sign in'}</Link><p className="plate-switch"><Link to="/faq">Read the marginalia</Link></p></Reveal></Frontispiece>
}

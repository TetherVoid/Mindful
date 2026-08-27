import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PasswordInput from '../components/PasswordInput'
import AuthHero from '../components/AuthHero'
import Reveal from '../components/Reveal'

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const data = await signUp(email, password)
      setSuccess(true)
      // If email confirmation is off, Supabase returns a session immediately.
      if (data.session) {
        setTimeout(() => navigate('/dashboard'), 1200)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <AuthHero>
        <Reveal className="auth-card form-success" delay={0.15} y={16}>
          <h1>You're in</h1>
          <p>
            Account created for <strong>{email}</strong>. If email confirmation is enabled on
            your Supabase project, check your inbox to confirm before signing in.
          </p>
          <Link className="btn-primary" to="/login">
            Go to sign in
          </Link>
        </Reveal>
      </AuthHero>
    )
  }

  return (
    <AuthHero>
      <Reveal as="form" className="auth-card" delay={0.15} y={16} onSubmit={handleSubmit}>
        <h1>Create your account</h1>
        {error && <div className="form-error">{error}</div>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
        <p className="auth-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </Reveal>
    </AuthHero>
  )
}

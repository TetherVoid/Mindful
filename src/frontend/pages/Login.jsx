import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@backend/auth/AuthContext'
import PasswordInput from '@frontend/components/PasswordInput'
import FormError from '@frontend/components/FormError'
import Frontispiece from '@design/primitives/Frontispiece'
import Reveal from '@design/primitives/Reveal'

export default function Login() {
  const { signIn, authError, clearAuthError, oauthProviders, signInWithOAuth, requestPasswordReset } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [oauthSubmitting, setOauthSubmitting] = useState(null)
  const [resetNotice, setResetNotice] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    clearAuthError()
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleOAuth(provider) {
    setError(null)
    clearAuthError()
    setOauthSubmitting(provider)
    try { await signInWithOAuth(provider) } catch (err) { setError(err.message); setOauthSubmitting(null) }
  }

  async function handleReset() {
    setError(null)
    setResetNotice(null)
    try {
      await requestPasswordReset(email)
      setResetNotice('If an account uses that address, a reset link is on its way.')
    } catch (err) { setError(err.message) }
  }

  return (
    <Frontispiece>
      <Reveal as="form" className="plate" index={1} y={18} onSubmit={handleSubmit}>
        <div className="plate-head">
          <p className="mono" style={{ color: 'var(--accent)', margin: '0 0 0.5rem' }}>
            Returning reader
          </p>
          <h1>Open your book</h1>
          <p>Everything is exactly where you left it.</p>
        </div>

        <FormError message={error ?? authError} label="Sign-in" />
        {resetNotice && <p className="form-success" role="status">{resetNotice}</p>}

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
        <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />

        <button type="button" className="btn btn--quiet btn--sm" onClick={handleReset} disabled={submitting || !email}>
          Send password reset link
        </button>

        <button type="submit" className="btn btn--solid btn--block" disabled={submitting}>
          {submitting ? 'Opening…' : 'Sign in'}
        </button>

        {oauthProviders.length > 0 && (
          <div className="ledger">
            {oauthProviders.map((provider) => (
              <button key={provider} type="button" className="btn btn--quiet btn--block" onClick={() => handleOAuth(provider)} disabled={Boolean(oauthSubmitting)}>
                {oauthSubmitting === provider ? 'Connecting…' : `Continue with ${provider[0].toUpperCase()}${provider.slice(1)}`}
              </button>
            ))}
          </div>
        )}

        <p className="plate-switch">
          No book yet? <Link to="/signup">Start one</Link>
        </p>
      </Reveal>
    </Frontispiece>
  )
}

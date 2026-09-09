import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@backend/auth/AuthContext'
import PasswordInput from '@frontend/components/PasswordInput'
import FormError from '@frontend/components/FormError'
import Frontispiece from '@design/primitives/Frontispiece'
import Reveal from '@design/primitives/Reveal'

export default function Signup() {
  const { signUp, oauthProviders, signInWithOAuth } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [oauthSubmitting, setOauthSubmitting] = useState(null)

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

  async function handleOAuth(provider) {
    setError(null)
    setOauthSubmitting(provider)
    try { await signInWithOAuth(provider) } catch (err) { setError(err.message); setOauthSubmitting(null) }
  }

  if (success) {
    return (
      <Frontispiece>
        <Reveal className="plate" index={1} y={18}>
          <div className="plate-head">
            <p className="mono" style={{ color: 'var(--accent)', margin: '0 0 0.5rem' }}>
              Page one
            </p>
            <h1>Your book is open</h1>
          </div>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>
            Registered to <strong style={{ color: 'var(--text)' }}>{email}</strong>. If email
            confirmation is switched on for this project, confirm from your inbox before signing in.
          </p>
          <Link className="btn btn--solid btn--block" to="/login" style={{ marginTop: '1.25rem' }}>
            Go to sign in
          </Link>
        </Reveal>
      </Frontispiece>
    )
  }

  return (
    <Frontispiece>
      <Reveal as="form" className="plate" index={1} y={18} onSubmit={handleSubmit}>
        <div className="plate-head">
          <p className="mono" style={{ color: 'var(--accent)', margin: '0 0 0.5rem' }}>
            New volume
          </p>
          <h1>Start your book</h1>
          <p>Two fields. No onboarding tour, no questionnaire.</p>
        </div>

        <FormError message={error} label="Sign-up" />

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

        <button type="submit" className="btn btn--solid btn--block" disabled={submitting}>
          {submitting ? 'Binding…' : 'Create account'}
        </button>

        {oauthProviders.length > 0 && <div className="ledger">{oauthProviders.map((provider) => <button key={provider} type="button" className="btn btn--quiet btn--block" onClick={() => handleOAuth(provider)} disabled={Boolean(oauthSubmitting)}>{oauthSubmitting === provider ? 'Connecting…' : `Continue with ${provider[0].toUpperCase()}${provider.slice(1)}`}</button>)}</div>}

        <p className="plate-switch">
          Already keeping one? <Link to="/login">Sign in</Link>
        </p>
      </Reveal>
    </Frontispiece>
  )
}

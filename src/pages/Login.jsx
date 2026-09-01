import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PasswordInput from '../components/PasswordInput'
import FormError from '../components/FormError'
import Frontispiece from '../components/Frontispiece'
import Reveal from '../components/Reveal'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
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

        <FormError message={error} label="Sign-in" />

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

        <button type="submit" className="btn btn--solid btn--block" disabled={submitting}>
          {submitting ? 'Opening…' : 'Sign in'}
        </button>

        <p className="plate-switch">
          No book yet? <Link to="/signup">Start one</Link>
        </p>
      </Reveal>
    </Frontispiece>
  )
}

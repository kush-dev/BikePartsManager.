import { useState } from 'react'
import {
  Bike,
  UserRound,
  LockKeyhole,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react'

import './Login.css'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    setError('')
    setLoading(true)

    try {
      await onLogin({ username, password })
    } catch (err) {
      setError(err.message || 'Unable to log in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon">
            <Bike size={29} strokeWidth={2.2} />
          </div>

          <div>
            <h1>OnRoute</h1>
            <span>BIKE SPARE PARTS MANAGER</span>
          </div>
        </div>

        <div className="login-heading">
          <div className="login-eyebrow">WORKSPACE ACCESS</div>
          <h2>Welcome back</h2>
          <p>Sign in to access your shop management workspace.</p>
        </div>

        {error && (
          <div className="login-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="login-username">Username</label>

          <div className="login-input-wrap">
            <UserRound size={18} />
            <input
              id="login-username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </div>

          <label htmlFor="login-password">Password</label>

          <div className="login-input-wrap">
            <LockKeyhole size={18} />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />

            <button
              type="button"
              className="login-password-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          <button
            type="submit"
            className="login-submit"
            disabled={loading || !username.trim() || !password}
          >
            {loading ? (
              <>
                <span className="login-spinner" />
                Signing in...
              </>
            ) : (
              'Sign in to workspace'
            )}
          </button>
        </form>

        <div className="login-security">
          <ShieldCheck size={17} />
          <span>Secure administrator access</span>
        </div>

        <footer className="login-footer">
          OnRoute Bike Spare Parts · Management Workspace
        </footer>
      </section>
    </main>
  )
}
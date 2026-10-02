import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { authUsers } from '../../data/mockUsers'
import { paths } from '../../routes'
import Button from '../ui/Button'
import AuthBrand from './AuthBrand'

// Demo-only helper list: role + username, no passwords rendered per row.
const demoAccounts = authUsers.map(({ id, username, role, status }) => ({ id, username, role, status }))

function LoginPage() {
  const { login } = useAuth()
  const location = useLocation()
  // Sign-up and password reset hand over the email and a confirmation notice.
  const prefillEmail = location.state?.email || ''
  const notice = location.state?.notice || ''
  const identifierRef = useRef(null)
  const passwordRef = useRef(null)

  const [identifier, setIdentifier] = useState(prefillEmail)
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [authError, setAuthError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (prefillEmail) {
      passwordRef.current?.focus()
    } else {
      identifierRef.current?.focus()
    }
  }, [prefillEmail])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    const errors = {}
    if (!identifier.trim()) errors.identifier = 'Email or username is required.'
    if (!password) errors.password = 'Password is required.'
    setFieldErrors(errors)
    setAuthError('')

    if (errors.identifier) {
      identifierRef.current?.focus()
      return
    }
    if (errors.password) {
      passwordRef.current?.focus()
      return
    }

    setSubmitting(true)
    const result = await login(identifier, password, rememberMe)
    // On success the /login guard redirects, so only failures need handling here.
    if (!result.ok) {
      setSubmitting(false)
      setAuthError(result.error)
      setPassword('')
      passwordRef.current?.focus()
    }
  }

  const fillDemoAccount = (username) => {
    setIdentifier(username)
    setFieldErrors((current) => ({ ...current, identifier: undefined }))
    setAuthError('')
    passwordRef.current?.focus()
  }

  return (
    <div className="auth-page">
      <div className="auth-page__inner">
        <section className="auth-card" aria-labelledby="auth-title">
          <AuthBrand />

          <h1 id="auth-title" className="auth-card__title">Sign in to Vantrix POS</h1>
          <p className="auth-card__subtitle">
            Enter your staff credentials to access the register and back office.
          </p>

          {notice && (
            <div className="auth-alert auth-alert--success auth-card__notice" role="status">
              {notice}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label htmlFor="auth-identifier">Email or Username</label>
              <input
                id="auth-identifier"
                ref={identifierRef}
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                aria-invalid={Boolean(fieldErrors.identifier)}
                aria-describedby={fieldErrors.identifier ? 'auth-identifier-error' : undefined}
                disabled={submitting}
              />
              {fieldErrors.identifier && (
                <p id="auth-identifier-error" className="auth-field__error">{fieldErrors.identifier}</p>
              )}
            </div>

            <div className="auth-field">
              <div className="auth-field__label-row">
                <label htmlFor="auth-password">Password</label>
                <Link to={paths.forgotPassword} className="auth-link">
                  Forgot password?
                </Link>
              </div>
              <div className="auth-password">
                <input
                  id="auth-password"
                  ref={passwordRef}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="auth-password__toggle"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  aria-controls="auth-password"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="auth-password-error" className="auth-field__error">{fieldErrors.password}</p>
              )}
            </div>

            <label className="auth-checkbox">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
                disabled={submitting}
              />
              <span>Remember me on this device</span>
            </label>

            {authError && (
              <div id="auth-error" className="auth-alert auth-alert--error" role="alert">
                {authError}
              </div>
            )}

            <Button
              type="submit"
              className="auth-submit"
              disabled={submitting}
              aria-describedby={authError ? 'auth-error' : undefined}
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </section>

        <p className="auth-footer">
          New to Vantrix?{' '}
          <Link to={paths.signup} className="auth-link">
            Create a business account
          </Link>
        </p>

        <section className="auth-demo" aria-labelledby="auth-demo-title">
          <div className="auth-demo__header">
            <h2 id="auth-demo-title">Demo accounts</h2>
            <span>Password for all: <code>demo1234</code></span>
          </div>
          <ul className="auth-demo__list">
            {demoAccounts.map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  className="auth-demo__row"
                  onClick={() => fillDemoAccount(account.username)}
                  disabled={submitting}
                >
                  <span className="auth-demo__role">{account.role}</span>
                  <code>{account.username}</code>
                  {account.status !== 'Active' && <span className="auth-demo__status">{account.status}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

export default LoginPage

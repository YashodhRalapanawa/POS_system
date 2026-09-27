import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { paths } from '../../routes'
import Button from '../ui/Button'
import AuthBrand from './AuthBrand'
import PasswordChecklist from './PasswordChecklist'
import { validateConfirmPassword, validateNewPassword } from './passwordRules'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const NEUTRAL_MESSAGE = 'If an account exists for this email, a reset link has been sent.'

function validateEmail(value) {
  const email = value.trim()
  if (!email) return 'Email is required.'
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.'
  return ''
}

function RequestStep({ email, setEmail, onSimulateLink }) {
  const { requestPasswordReset } = useAuth()
  const emailRef = useRef(null)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    const emailError = validateEmail(email)
    setError(emailError)
    if (emailError) {
      emailRef.current?.focus()
      return
    }

    setSubmitting(true)
    await requestPasswordReset(email)
    setSubmitting(false)
    setSent(true)
  }

  return (
    <>
      <h1 id="auth-title" className="auth-card__title">Reset your password</h1>
      <p className="auth-card__subtitle">
        Enter the email linked to your staff account and we&rsquo;ll send you a link to reset your password.
      </p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="forgot-email">Email</label>
          <input
            id="forgot-email"
            ref={emailRef}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setSent(false)
            }}
            onBlur={() => email && setError(validateEmail(email))}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'forgot-email-error' : undefined}
            disabled={submitting}
          />
          {error && <p id="forgot-email-error" className="auth-field__error">{error}</p>}
        </div>

        {sent && (
          <div className="auth-alert auth-alert--info" role="status">
            {NEUTRAL_MESSAGE}
          </div>
        )}

        <Button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Sending...' : sent ? 'Resend Reset Link' : 'Send Reset Link'}
        </Button>
      </form>

      {sent && (
        <div className="auth-dev-panel">
          <span className="auth-dev-panel__tag">Dev only</span>
          <p>No email is sent in this frontend build. Simulate opening the reset link from the email instead.</p>
          <Button type="button" variant="secondary" size="sm" onClick={onSimulateLink}>
            Simulate reset link
          </Button>
        </div>
      )}
    </>
  )
}

function ResetStep({ email, onDone }) {
  const { resetPassword } = useAuth()
  const passwordRef = useRef(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [linkError, setLinkError] = useState('')

  useEffect(() => {
    passwordRef.current?.focus()
  }, [])

  const passwordError = (touched.password || submitted) ? validateNewPassword(password) : ''
  const confirmError = (touched.confirmPassword || submitted) ? validateConfirmPassword(password, confirmPassword) : ''

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    setSubmitted(true)
    if (validateNewPassword(password)) {
      passwordRef.current?.focus()
      return
    }
    if (validateConfirmPassword(password, confirmPassword)) {
      document.getElementById('reset-confirm')?.focus()
      return
    }

    setSubmitting(true)
    setLinkError('')
    const result = await resetPassword(email, password)
    setSubmitting(false)

    if (!result.ok) {
      setLinkError(result.error)
      return
    }
    onDone(result.email)
  }

  const markTouched = (field) => setTouched((current) => ({ ...current, [field]: true }))

  return (
    <>
      <h1 id="auth-title" className="auth-card__title">Choose a new password</h1>
      <p className="auth-card__subtitle">
        Resetting the password for <strong>{email.trim()}</strong>.
      </p>

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="reset-password">New Password</label>
          <div className="auth-password">
            <input
              id="reset-password"
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => markTouched('password')}
              aria-invalid={Boolean(passwordError)}
              aria-describedby={['reset-password-rules', passwordError && 'reset-password-error'].filter(Boolean).join(' ')}
              disabled={submitting}
            />
            <button
              type="button"
              className="auth-password__toggle"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
              aria-pressed={showPassword}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {passwordError && <p id="reset-password-error" className="auth-field__error">{passwordError}</p>}
          <PasswordChecklist id="reset-password-rules" value={password} />
        </div>

        <div className="auth-field">
          <label htmlFor="reset-confirm">Confirm Password</label>
          <input
            id="reset-confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            onBlur={() => markTouched('confirmPassword')}
            aria-invalid={Boolean(confirmError)}
            aria-describedby={confirmError ? 'reset-confirm-error' : undefined}
            disabled={submitting}
          />
          {confirmError && <p id="reset-confirm-error" className="auth-field__error">{confirmError}</p>}
        </div>

        {linkError && (
          <div className="auth-alert auth-alert--error" role="alert">
            {linkError}
          </div>
        )}

        <Button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? 'Updating password...' : 'Reset Password'}
        </Button>
      </form>
    </>
  )
}

function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState('request')
  const [email, setEmail] = useState('')
  const [resetEmail, setResetEmail] = useState('')

  const goToSignIn = () => {
    navigate(paths.login, {
      state: { email: resetEmail, notice: 'Password updated. Sign in with your new password.' },
    })
  }

  return (
    <div className="auth-page">
      <div className="auth-page__inner">
        <section className="auth-card" aria-labelledby="auth-title">
          <AuthBrand />

          {step === 'request' && (
            <RequestStep email={email} setEmail={setEmail} onSimulateLink={() => setStep('reset')} />
          )}

          {step === 'reset' && (
            <ResetStep
              email={email}
              onDone={(updatedEmail) => {
                setResetEmail(updatedEmail)
                setStep('done')
              }}
            />
          )}

          {step === 'done' && (
            <div className="auth-result">
              <div className="auth-result__icon auth-result__icon--success" aria-hidden="true">✓</div>
              <h1 id="auth-title" className="auth-card__title">Password updated. You can now sign in.</h1>
              <p className="auth-card__subtitle">Use your new password the next time you sign in to Vantrix POS.</p>
              <Button type="button" className="auth-submit" onClick={goToSignIn} autoFocus>
                Go to Sign In
              </Button>
            </div>
          )}
        </section>

        <p className="auth-footer">
          <Link to={paths.login} className="auth-link">
            ← Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  )
}

export default ForgotPasswordPage

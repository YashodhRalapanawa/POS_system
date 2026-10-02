import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { paths } from '../../routes'
import Button from '../ui/Button'
import AuthBrand from './AuthBrand'
import PasswordChecklist from './PasswordChecklist'
import TermsModal from './TermsModal'
import { validateConfirmPassword, validateNewPassword } from './passwordRules'

const businessTypes = ['Retail', 'Electronics', 'Grocery', 'Pharmacy', 'Restaurant', 'Other']
const countries = ['Sri Lanka', 'India', 'Maldives', 'Bangladesh', 'Singapore', 'United Arab Emirates', 'United Kingdom', 'United States', 'Australia', 'Other']
const currencies = ['USD', 'LKR', 'INR', 'EUR', 'GBP', 'AUD', 'SGD', 'AED']

// Field order drives which invalid field receives focus on submit.
const fieldOrder = [
  'businessName',
  'businessPhone',
  'fullName',
  'email',
  'username',
  'password',
  'confirmPassword',
  'agreeTerms',
]

const initialValues = {
  businessName: '',
  businessType: 'Retail',
  businessPhone: '',
  country: 'Sri Lanka',
  currency: 'USD',
  fullName: '',
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
  agreeTerms: false,
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_PATTERN = /^\+?[0-9\s()-]{7,20}$/
const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/

function validate(values, { isEmailTaken, isUsernameTaken }) {
  const errors = {}

  if (!values.businessName.trim()) errors.businessName = 'Business name is required.'

  if (!values.businessPhone.trim()) errors.businessPhone = 'Business phone is required.'
  else if (!PHONE_PATTERN.test(values.businessPhone.trim())) errors.businessPhone = 'Enter a valid phone number.'

  if (!values.fullName.trim()) errors.fullName = 'Full name is required.'

  const email = values.email.trim()
  if (!email) errors.email = 'Work email is required.'
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.'
  else if (isEmailTaken(email)) errors.email = 'An account with this email already exists.'

  const username = values.username.trim()
  if (!username) errors.username = 'Username is required.'
  else if (username.length < 4 || username.length > 20) errors.username = 'Username must be 4–20 characters.'
  else if (!USERNAME_PATTERN.test(username)) errors.username = 'Use letters, numbers and underscores only.'
  else if (isUsernameTaken(username)) errors.username = 'This username is already taken.'

  const passwordError = validateNewPassword(values.password)
  if (passwordError) errors.password = passwordError

  const confirmError = validateConfirmPassword(values.password, values.confirmPassword)
  if (confirmError) errors.confirmPassword = confirmError

  if (!values.agreeTerms) errors.agreeTerms = 'You must agree to the Terms of Service and Privacy Policy.'

  return errors
}

function describedBy(...ids) {
  const value = ids.filter(Boolean).join(' ')
  return value || undefined
}

function SignUpPage() {
  const { register, isEmailTaken, isUsernameTaken } = useAuth()
  const navigate = useNavigate()
  const firstFieldRef = useRef(null)

  const [values, setValues] = useState(initialValues)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [termsDoc, setTermsDoc] = useState(null)
  const [created, setCreated] = useState(null)

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  const closeTerms = useCallback(() => setTermsDoc(null), [])

  const errors = useMemo(
    () => validate(values, { isEmailTaken, isUsernameTaken }),
    [values, isEmailTaken, isUsernameTaken],
  )

  const visibleError = (field) => serverErrors[field] || ((touched[field] || submitted) && errors[field]) || ''

  const setField = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }))
    setServerErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  const handleChange = (event) => {
    const { name, type, value, checked } = event.target
    setField(name, type === 'checkbox' ? checked : value)
  }

  const handleBlur = (event) => {
    const { name } = event.target
    setTouched((current) => (current[name] ? current : { ...current, [name]: true }))
  }

  const focusField = (field) => {
    document.getElementById(`signup-${field}`)?.focus()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting) return

    setSubmitted(true)
    const firstInvalid = fieldOrder.find((field) => errors[field])
    if (firstInvalid) {
      focusField(firstInvalid)
      return
    }

    setSubmitting(true)
    const result = await register({
      business: {
        name: values.businessName,
        type: values.businessType,
        phone: values.businessPhone,
        country: values.country,
        currency: values.currency,
      },
      admin: {
        fullName: values.fullName,
        email: values.email,
        username: values.username,
        password: values.password,
      },
    })
    setSubmitting(false)

    if (!result.ok) {
      setServerErrors(result.fieldErrors || {})
      const firstServerError = fieldOrder.find((field) => result.fieldErrors?.[field])
      if (firstServerError) focusField(firstServerError)
      return
    }

    setCreated({ businessName: values.businessName.trim(), email: result.user.email })
  }

  const continueToSignIn = () => {
    navigate(paths.login, {
      state: {
        email: created.email,
        notice: 'Account created. Sign in with your new administrator account.',
      },
    })
  }

  if (created) {
    return (
      <div className="auth-page">
        <div className="auth-page__inner">
          <section className="auth-card auth-card--result" aria-labelledby="auth-title">
            <AuthBrand />
            <div className="auth-result__icon auth-result__icon--success" aria-hidden="true">✓</div>
            <h1 id="auth-title" className="auth-card__title" tabIndex={-1}>
              Account created. Your store &lsquo;{created.businessName}&rsquo; is ready.
            </h1>
            <p className="auth-card__subtitle">
              Sign in as the administrator (<strong>{created.email}</strong>) to finish setting up your store and add
              your staff.
            </p>
            <Button type="button" className="auth-submit" onClick={continueToSignIn} autoFocus>
              Continue to Sign In
            </Button>
          </section>
        </div>
      </div>
    )
  }

  const renderInput = (field, label, { type = 'text', autoComplete, inputRef, describedExtra, inputMode } = {}) => {
    const error = visibleError(field)
    const errorId = error ? `signup-${field}-error` : null
    return (
      <div className="auth-field">
        <label htmlFor={`signup-${field}`}>{label}</label>
        <input
          id={`signup-${field}`}
          ref={inputRef}
          name={field}
          type={type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          value={values[field]}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy(errorId, describedExtra)}
        />
        {error && <p id={errorId} className="auth-field__error">{error}</p>}
      </div>
    )
  }

  const renderSelect = (field, label, options) => (
    <div className="auth-field">
      <label htmlFor={`signup-${field}`}>{label}</label>
      <select id={`signup-${field}`} name={field} value={values[field]} onChange={handleChange}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  )

  const passwordError = visibleError('password')
  const termsError = visibleError('agreeTerms')

  return (
    <div className="auth-page">
      <div className="auth-page__inner auth-page__inner--wide">
        <section className="auth-card" aria-labelledby="auth-title">
          <AuthBrand />

          <h1 id="auth-title" className="auth-card__title">Create your business account</h1>
          <p className="auth-card__subtitle">
            Set up your store and administrator account to start using Vantrix POS.
          </p>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <fieldset className="auth-section" disabled={submitting}>
              <legend className="auth-section__title">Business Details</legend>

              {renderInput('businessName', 'Business Name', { autoComplete: 'organization', inputRef: firstFieldRef })}

              <div className="auth-grid">
                {renderSelect('businessType', 'Business Type', businessTypes)}
                {renderInput('businessPhone', 'Business Phone', { type: 'tel', autoComplete: 'tel', inputMode: 'tel' })}
              </div>

              <div className="auth-grid">
                {renderSelect('country', 'Country', countries)}
                {renderSelect('currency', 'Currency', currencies)}
              </div>
            </fieldset>

            <fieldset className="auth-section" disabled={submitting}>
              <legend className="auth-section__title">Administrator Account</legend>

              {renderInput('fullName', 'Full Name', { autoComplete: 'name' })}
              {renderInput('email', 'Work Email', { type: 'email', autoComplete: 'email' })}
              {renderInput('username', 'Username', { autoComplete: 'username', describedExtra: 'signup-username-hint' })}
              <p id="signup-username-hint" className="auth-field__hint">
                4–20 characters: letters, numbers and underscores.
              </p>

              <div className="auth-field">
                <label htmlFor="signup-password">Password</label>
                <div className="auth-password">
                  <input
                    id="signup-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={values.password}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    aria-invalid={Boolean(passwordError)}
                    aria-describedby={describedBy(passwordError && 'signup-password-error', 'signup-password-rules')}
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
                {passwordError && <p id="signup-password-error" className="auth-field__error">{passwordError}</p>}
                <PasswordChecklist id="signup-password-rules" value={values.password} />
              </div>

              {renderInput('confirmPassword', 'Confirm Password', {
                type: showPassword ? 'text' : 'password',
                autoComplete: 'new-password',
              })}
            </fieldset>

            <fieldset className="auth-section auth-section--plain" disabled={submitting}>
              <legend className="auth-sr-only">Agreements</legend>
              <div className="auth-checkbox auth-checkbox--terms">
                <input
                  id="signup-agreeTerms"
                  name="agreeTerms"
                  type="checkbox"
                  checked={values.agreeTerms}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  aria-invalid={Boolean(termsError)}
                  aria-describedby={termsError ? 'signup-agreeTerms-error' : undefined}
                />
                <span>
                  <label htmlFor="signup-agreeTerms">I agree to the </label>
                  <button type="button" className="auth-link auth-link--inline" onClick={() => setTermsDoc('terms')}>
                    Terms of Service
                  </button>
                  {' and '}
                  <button type="button" className="auth-link auth-link--inline" onClick={() => setTermsDoc('privacy')}>
                    Privacy Policy
                  </button>
                </span>
              </div>
              {termsError && <p id="signup-agreeTerms-error" className="auth-field__error">{termsError}</p>}
            </fieldset>

            <Button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>
        </section>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to={paths.login} className="auth-link">
            Sign in
          </Link>
        </p>
      </div>

      <TermsModal doc={termsDoc} onClose={closeTerms} />
    </div>
  )
}

export default SignUpPage

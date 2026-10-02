import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import Button from '../ui/Button'
import Card from '../ui/Card'
import PasswordChecklist from '../auth/PasswordChecklist'
import { validateConfirmPassword, validateNewPassword } from '../auth/passwordRules'

const emptyForm = { currentPassword: '', newPassword: '', confirmPassword: '' }
const fieldOrder = ['currentPassword', 'newPassword', 'confirmPassword']

function validate(form) {
  const errors = {}
  if (!form.currentPassword) errors.currentPassword = 'Current password is required.'

  const newError = validateNewPassword(form.newPassword)
  if (newError) errors.newPassword = newError
  else if (form.currentPassword && form.newPassword === form.currentPassword) {
    errors.newPassword = 'New password must be different from your current password.'
  }

  const confirmError = validateConfirmPassword(form.newPassword, form.confirmPassword)
  if (confirmError) errors.confirmPassword = confirmError
  return errors
}

function PasswordInput({ id, label, value, visible, onToggle, onChange, onBlur, error, describedBy, autoComplete, disabled }) {
  const describedIds = [error && `${id}-error`, describedBy].filter(Boolean).join(' ') || undefined
  return (
    <div className="profile-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          aria-invalid={Boolean(error)}
          aria-describedby={describedIds}
          disabled={disabled}
        />
        <button
          type="button"
          className="auth-password__toggle"
          onClick={onToggle}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="profile-field__error">
          {error}
        </p>
      )}
    </div>
  )
}

function ChangePasswordCard() {
  const { changePassword } = useAuth()
  const [form, setForm] = useState(emptyForm)
  const [visible, setVisible] = useState({})
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  const errors = validate(form)
  const visibleError = (field) => serverErrors[field] || ((touched[field] || submitted) && errors[field]) || ''

  const fieldProps = (field) => ({
    id: `password-${field}`,
    value: form[field],
    visible: Boolean(visible[field]),
    onToggle: () => setVisible((current) => ({ ...current, [field]: !current[field] })),
    onChange: (event) => {
      const { value } = event.target
      setForm((current) => ({ ...current, [field]: value }))
      setServerErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
      setSuccess('')
    },
    onBlur: () => setTouched((current) => ({ ...current, [field]: true })),
    error: visibleError(field),
    disabled: saving,
  })

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    setSubmitted(true)
    const firstInvalid = fieldOrder.find((field) => errors[field])
    if (firstInvalid) {
      document.getElementById(`password-${firstInvalid}`)?.focus()
      return
    }

    setSaving(true)
    const result = await changePassword(form.currentPassword, form.newPassword)
    setSaving(false)

    if (!result.ok) {
      setServerErrors(result.fieldErrors || {})
      const firstServerError = fieldOrder.find((field) => result.fieldErrors?.[field])
      if (firstServerError) document.getElementById(`password-${firstServerError}`)?.focus()
      return
    }

    setForm(emptyForm)
    setVisible({})
    setTouched({})
    setSubmitted(false)
    setServerErrors({})
    setSuccess('Password updated successfully.')
  }

  return (
    <Card className="profile-card" title="Change Password" subtitle="Use a strong password you don't use anywhere else.">
      <form className="profile-form" onSubmit={handleSubmit} noValidate>
        <div className="profile-password-fields">
          <PasswordInput {...fieldProps('currentPassword')} label="Current Password" autoComplete="current-password" />
          <div>
            <PasswordInput
              {...fieldProps('newPassword')}
              label="New Password"
              autoComplete="new-password"
              describedBy="password-newPassword-rules"
            />
            <PasswordChecklist id="password-newPassword-rules" value={form.newPassword} />
          </div>
          <PasswordInput {...fieldProps('confirmPassword')} label="Confirm New Password" autoComplete="new-password" />
        </div>

        {success && (
          <div className="auth-alert auth-alert--success profile-alert" role="status">
            {success}
          </div>
        )}

        <div className="profile-actions">
          <Button type="submit" disabled={saving}>
            {saving ? 'Updating password...' : 'Update Password'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

export default ChangePasswordCard

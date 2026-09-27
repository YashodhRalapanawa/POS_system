import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import Button from '../ui/Button'
import Card from '../ui/Card'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_PATTERN = /^\+?[0-9\s()-]{7,20}$/

function toForm(user) {
  return { fullName: user.fullName || '', email: user.email || '', phone: user.phone || '' }
}

function PersonalInfoCard({ user }) {
  const { updateProfile, isEmailTaken } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => toForm(user))
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')

  const original = toForm(user)
  const isDirty =
    form.fullName.trim() !== original.fullName ||
    form.email.trim().toLowerCase() !== original.email.toLowerCase() ||
    form.phone.trim() !== original.phone

  const errors = {}
  if (!form.fullName.trim()) errors.fullName = 'Full name is required.'
  const email = form.email.trim()
  if (!email) errors.email = 'Email is required.'
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.'
  else if (isEmailTaken(email, user.id)) errors.email = 'Another account already uses this email.'
  if (form.phone.trim() && !PHONE_PATTERN.test(form.phone.trim())) errors.phone = 'Enter a valid phone number.'

  const visibleError = (field) => serverErrors[field] || ((touched[field] || submitted) && errors[field]) || ''

  const startEditing = () => {
    setForm(toForm(user))
    setTouched({})
    setSubmitted(false)
    setServerErrors({})
    setSuccess('')
    setEditing(true)
  }

  const cancelEditing = () => {
    setForm(toForm(user))
    setEditing(false)
  }

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setServerErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving || !isDirty) return

    setSubmitted(true)
    const firstInvalid = ['fullName', 'email', 'phone'].find((field) => errors[field])
    if (firstInvalid) {
      document.getElementById(`profile-${firstInvalid}`)?.focus()
      return
    }

    setSaving(true)
    const result = await updateProfile(form)
    setSaving(false)

    if (!result.ok) {
      setServerErrors(result.fieldErrors || {})
      return
    }
    setEditing(false)
    setSuccess('Profile updated successfully.')
  }

  const renderInput = (field, label, { type = 'text', autoComplete, optional } = {}) => {
    const error = visibleError(field)
    return (
      <div className="profile-field">
        <label htmlFor={`profile-${field}`}>
          {label}
          {optional && <span className="profile-field__optional"> (optional)</span>}
        </label>
        <input
          id={`profile-${field}`}
          type={type}
          autoComplete={autoComplete}
          value={form[field]}
          onChange={(event) => updateField(field, event.target.value)}
          onBlur={() => setTouched((current) => ({ ...current, [field]: true }))}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `profile-${field}-error` : undefined}
          disabled={saving}
        />
        {error && (
          <p id={`profile-${field}-error`} className="profile-field__error">
            {error}
          </p>
        )}
      </div>
    )
  }

  const readOnly = (label, value, helper) => (
    <div className="profile-readonly">
      <span className="profile-readonly__label">{label}</span>
      <span className="profile-readonly__value">{value || '—'}</span>
      {helper && <span className="profile-readonly__helper">{helper}</span>}
    </div>
  )

  return (
    <Card
      className="profile-card"
      title="Personal Information"
      subtitle="Your contact details as shown to other staff."
      headerAction={
        !editing && (
          <Button variant="secondary" type="button" onClick={startEditing}>
            Edit
          </Button>
        )
      }
    >
      {success && !editing && (
        <div className="auth-alert auth-alert--success profile-alert" role="status">
          {success}
        </div>
      )}

      {editing ? (
        <form className="profile-form" onSubmit={handleSubmit} noValidate>
          <div className="profile-grid">
            {renderInput('fullName', 'Full Name', { autoComplete: 'name' })}
            {renderInput('email', 'Email', { type: 'email', autoComplete: 'email' })}
            {renderInput('phone', 'Phone', { type: 'tel', autoComplete: 'tel', optional: true })}
            {readOnly('Username', user.username, 'Contact an administrator to change your username.')}
            {readOnly('Employee Code', user.employeeCode)}
            {readOnly('Role', user.role, 'Roles are managed by administrators.')}
            {readOnly('Store', user.storeName)}
          </div>

          <div className="profile-actions">
            <Button variant="secondary" type="button" onClick={cancelEditing} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isDirty || saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="profile-grid">
          {readOnly('Full Name', user.fullName)}
          {readOnly('Email', user.email)}
          {readOnly('Phone', user.phone)}
          {readOnly('Username', user.username, 'Contact an administrator to change your username.')}
          {readOnly('Employee Code', user.employeeCode)}
          {readOnly('Role', user.role, 'Roles are managed by administrators.')}
          {readOnly('Store', user.storeName)}
        </div>
      )}
    </Card>
  )
}

export default PersonalInfoCard

import { useEffect, useState } from 'react'
import Button from './ui/Button'

const defaultForm = {
  name: '',
  code: '',
  customerType: 'Individual',
  phone: '',
  email: '',
  address: '',
  city: '',
  country: 'Sri Lanka',
  status: 'Active',
}

function CustomerFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialValues = null,
  mode = 'add',
  isSubmitting = false,
  serverError = '',
}) {
  const [formData, setFormData] = useState(defaultForm)
  const [clientError, setClientError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setFormData(defaultForm)
      setClientError('')
      return
    }

    setFormData(initialValues ? { ...defaultForm, ...initialValues } : defaultForm)
    setClientError('')
  }, [isOpen, initialValues])

  if (!isOpen) return null

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }))
    if (clientError) {
      setClientError('')
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (isSubmitting) return

    const cleanedName = formData.name.trim()
    const cleanedCode = formData.code.trim()
    const cleanedPhone = formData.phone.trim()
    const cleanedEmail = formData.email.trim()
    const cleanedAddress = formData.address.trim()
    const cleanedCity = formData.city.trim()
    const cleanedCountry = formData.country.trim()

    if (!cleanedName) {
      setClientError('Customer name is required.')
      return
    }

    if (!cleanedCode) {
      setClientError('Customer code is required.')
      return
    }

    if (cleanedEmail && !/^\S+@\S+\.\S+$/.test(cleanedEmail)) {
      setClientError('Please enter a valid email address.')
      return
    }

    onSubmit({
      ...formData,
      name: cleanedName,
      code: cleanedCode,
      phone: cleanedPhone,
      email: cleanedEmail,
      address: cleanedAddress,
      city: cleanedCity,
      country: cleanedCountry,
      customerType: formData.customerType || 'Individual',
      status: formData.status || 'Active',
      isActive: (formData.status || 'Active') === 'Active',
    })
  }

  const displayError = serverError || clientError
  const title = mode === 'edit' ? 'Edit Customer' : 'Add Customer'
  const actionLabel = isSubmitting
    ? (mode === 'edit' ? 'Saving...' : 'Creating...')
    : (mode === 'edit' ? 'Save Changes' : 'Create Customer')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="product-form-modal customer-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-modal__header">
          <div>
            <span className="section-label">Customer Management</span>
            <h3>{title}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose} disabled={isSubmitting}>×</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Customer Name *</span>
              <input
                value={formData.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="e.g. Kasun Perera"
                disabled={isSubmitting}
                autoFocus
              />
            </label>

            <label>
              <span>Customer Code *</span>
              <input
                value={formData.code}
                onChange={(event) => updateField('code', event.target.value)}
                placeholder="e.g. CUS-001"
                disabled={isSubmitting}
              />
            </label>

            <label>
              <span>Customer Type</span>
              <select
                value={formData.customerType}
                onChange={(event) => updateField('customerType', event.target.value)}
                disabled={isSubmitting}
              >
                <option value="Individual">Individual</option>
                <option value="Business">Business</option>
              </select>
            </label>

            <label>
              <span>Status</span>
              <select
                value={formData.status}
                onChange={(event) => updateField('status', event.target.value)}
                disabled={isSubmitting}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>

            <label>
              <span>Phone</span>
              <input
                value={formData.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                placeholder="e.g. +94 77 123 4567"
                disabled={isSubmitting}
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={formData.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="e.g. hello@example.com"
                disabled={isSubmitting}
              />
            </label>

            <label style={{ gridColumn: '1 / -1' }}>
              <span>Address</span>
              <input
                value={formData.address}
                onChange={(event) => updateField('address', event.target.value)}
                placeholder="e.g. 18, Temple Road"
                disabled={isSubmitting}
              />
            </label>

            <label>
              <span>City</span>
              <input
                value={formData.city}
                onChange={(event) => updateField('city', event.target.value)}
                placeholder="e.g. Colombo"
                disabled={isSubmitting}
              />
            </label>

            <label>
              <span>Country</span>
              <input
                value={formData.country}
                onChange={(event) => updateField('country', event.target.value)}
                placeholder="e.g. Sri Lanka"
                disabled={isSubmitting}
              />
            </label>
          </div>

          {displayError && <div className="field-error" style={{ marginTop: '0.75rem' }}>{displayError}</div>}

          <div className="product-form__actions">
            <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>{actionLabel}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CustomerFormModal

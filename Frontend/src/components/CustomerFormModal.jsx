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
  codeConflictCheck = () => false,
}) {
  const [formData, setFormData] = useState(defaultForm)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setFormData(defaultForm)
      setError('')
      return
    }

    setFormData(initialValues ? { ...defaultForm, ...initialValues } : defaultForm)
    setError('')
  }, [isOpen, initialValues])

  if (!isOpen) return null

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }))
    if (error) {
      setError('')
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const cleanedName = formData.name.trim()
    const cleanedCode = formData.code.trim()
    const cleanedPhone = formData.phone.trim()
    const cleanedEmail = formData.email.trim()
    const cleanedAddress = formData.address.trim()
    const cleanedCity = formData.city.trim()
    const cleanedCountry = formData.country.trim()

    if (!cleanedName) {
      setError('Customer name is required.')
      return
    }

    if (!cleanedCode) {
      setError('Customer code is required.')
      return
    }

    if (!cleanedPhone) {
      setError('Phone is required.')
      return
    }

    if (formData.customerType === 'Business' && !cleanedEmail) {
      setError('Email is required for business customers.')
      return
    }

    if (codeConflictCheck(cleanedCode)) {
      setError('Customer code must be unique in the local mock data.')
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
    })
  }

  const title = mode === 'edit' ? 'Edit Customer' : 'Add Customer'
  const actionLabel = mode === 'edit' ? 'Save Changes' : 'Create Customer'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="product-form-modal customer-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-modal__header">
          <div>
            <span className="section-label">Customer Management</span>
            <h3>{title}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Customer Name</span>
              <input
                value={formData.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="e.g. Kasun Perera"
              />
            </label>

            <label>
              <span>Customer Code</span>
              <input
                value={formData.code}
                onChange={(event) => updateField('code', event.target.value)}
                placeholder="e.g. CUS-011"
              />
            </label>

            <label>
              <span>Customer Type</span>
              <select value={formData.customerType} onChange={(event) => updateField('customerType', event.target.value)}>
                <option value="Individual">Individual</option>
                <option value="Business">Business</option>
              </select>
            </label>

            <label>
              <span>Status</span>
              <select value={formData.status} onChange={(event) => updateField('status', event.target.value)}>
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
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={formData.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="e.g. hello@example.com"
              />
            </label>

            <label style={{ gridColumn: '1 / -1' }}>
              <span>Address</span>
              <input
                value={formData.address}
                onChange={(event) => updateField('address', event.target.value)}
                placeholder="e.g. 18, Temple Road"
              />
            </label>

            <label>
              <span>City</span>
              <input
                value={formData.city}
                onChange={(event) => updateField('city', event.target.value)}
                placeholder="e.g. Colombo"
              />
            </label>

            <label>
              <span>Country</span>
              <input
                value={formData.country}
                onChange={(event) => updateField('country', event.target.value)}
                placeholder="e.g. Sri Lanka"
              />
            </label>
          </div>

          {error && <div className="field-error">{error}</div>}

          <div className="product-form__actions">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit">{actionLabel}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CustomerFormModal

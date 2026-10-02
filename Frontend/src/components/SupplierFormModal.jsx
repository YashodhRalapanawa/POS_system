import { useEffect, useState } from 'react'
import Button from './ui/Button'

const defaultForm = {
  name: '',
  code: '',
  contactPerson: '',
  phone: '',
  email: '',
  supplierType: 'Distributor',
  address: '',
  city: '',
  country: 'Sri Lanka',
  status: 'Active',
}

function SupplierFormModal({
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
    const cleanedContact = formData.contactPerson.trim()
    const cleanedEmail = formData.email.trim()

    if (!cleanedName) {
      setError('Supplier name is required.')
      return
    }

    if (!cleanedCode) {
      setError('Supplier code is required.')
      return
    }

    if (!cleanedContact) {
      setError('Contact person is required.')
      return
    }

    if (!cleanedEmail) {
      setError('Email is required.')
      return
    }

    if (codeConflictCheck(cleanedCode)) {
      setError('Supplier code must be unique in the local mock data.')
      return
    }

    onSubmit({
      ...formData,
      name: cleanedName,
      code: cleanedCode,
      contactPerson: cleanedContact,
      email: cleanedEmail,
      phone: formData.phone.trim(),
      address: formData.address.trim(),
      city: formData.city.trim(),
      country: formData.country.trim(),
    })
  }

  const title = mode === 'edit' ? 'Edit Supplier' : 'Add Supplier'
  const actionLabel = mode === 'edit' ? 'Save Changes' : 'Create Supplier'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="product-form-modal supplier-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-modal__header">
          <div>
            <span className="section-label">Supplier Management</span>
            <h3>{title}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Supplier Name</span>
              <input
                value={formData.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="e.g. TechSource Lanka"
              />
            </label>

            <label>
              <span>Supplier Code</span>
              <input
                value={formData.code}
                onChange={(event) => updateField('code', event.target.value)}
                placeholder="e.g. SUP-009"
              />
            </label>

            <label>
              <span>Contact Person</span>
              <input
                value={formData.contactPerson}
                onChange={(event) => updateField('contactPerson', event.target.value)}
                placeholder="e.g. Nimal Perera"
              />
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
                placeholder="e.g. sales@supplier.example"
              />
            </label>

            <label>
              <span>Supplier Type</span>
              <select value={formData.supplierType} onChange={(event) => updateField('supplierType', event.target.value)}>
                <option value="Manufacturer">Manufacturer</option>
                <option value="Distributor">Distributor</option>
                <option value="Wholesaler">Wholesaler</option>
                <option value="Local Supplier">Local Supplier</option>
              </select>
            </label>

            <label>
              <span>Country</span>
              <input
                value={formData.country}
                onChange={(event) => updateField('country', event.target.value)}
                placeholder="e.g. Sri Lanka"
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

            <label style={{ gridColumn: '1 / -1' }}>
              <span>Address</span>
              <input
                value={formData.address}
                onChange={(event) => updateField('address', event.target.value)}
                placeholder="Street address or office location"
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

export default SupplierFormModal

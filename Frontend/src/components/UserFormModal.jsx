import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'

const defaultForm = {
  name: '',
  email: '',
  employeeId: '',
  role: 'Cashier',
  registerAccess: 'Register #01',
  status: 'Active',
}

const defaultRoleList = ['Administrator', 'Manager', 'Cashier', 'Inventory Clerk', 'Accountant']

function UserFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialValues = null,
  mode = 'add',
  existingUsers = [],
  roleOptions = defaultRoleList,
}) {
  const [formData, setFormData] = useState(defaultForm)
  const [error, setError] = useState('')

  const availableRoles = useMemo(() => {
    const list = Array.isArray(roleOptions) && roleOptions.length > 0 ? [...roleOptions] : [...defaultRoleList]
    if (initialValues?.role && !list.includes(initialValues.role)) {
      list.push(initialValues.role)
    }
    return list
  }, [roleOptions, initialValues])

  const normalizedInitialValues = useMemo(() => {
    if (!initialValues) return null

    return {
      ...defaultForm,
      ...initialValues,
    }
  }, [initialValues])

  useEffect(() => {
    if (!isOpen) {
      setFormData(defaultForm)
      setError('')
      return
    }

    setFormData(normalizedInitialValues || defaultForm)
    setError('')
  }, [isOpen, normalizedInitialValues])

  if (!isOpen) return null

  const updateField = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }))

    if (error) setError('')
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const cleanedName = formData.name.trim()
    const cleanedEmail = formData.email.trim()
    const cleanedEmployeeId = formData.employeeId.trim()

    if (!cleanedName) {
      setError('Full name is required.')
      return
    }

    if (!cleanedEmail) {
      setError('Email is required.')
      return
    }

    if (!/^\S+@\S+\.\S+$/.test(cleanedEmail)) {
      setError('Please enter a valid email address.')
      return
    }

    if (!cleanedEmployeeId) {
      setError('Employee ID is required.')
      return
    }

    const duplicateEmployeeId = existingUsers.some((user) => {
      const normalizedExistingId = user.employeeId.trim().toLowerCase()
      const normalizedCandidateId = cleanedEmployeeId.trim().toLowerCase()
      return normalizedExistingId === normalizedCandidateId && user.id !== initialValues?.id
    })

    if (duplicateEmployeeId) {
      setError('Employee ID already exists. Please choose a unique employee ID.')
      return
    }

    if (!formData.role) {
      setError('Role is required.')
      return
    }

    if (!formData.registerAccess) {
      setError('Register access is required.')
      return
    }

    onSubmit({
      ...formData,
      name: cleanedName,
      email: cleanedEmail,
      employeeId: cleanedEmployeeId,
      role: formData.role,
      registerAccess: formData.registerAccess,
      status: formData.status,
    })
  }

  const title = mode === 'edit' ? 'Edit User' : 'Add User'
  const actionLabel = mode === 'edit' ? 'Save User' : 'Create User'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="product-form-modal user-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-modal__header">
          <div>
            <span className="section-label">Staff Management</span>
            <h3>{title}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Full Name</span>
              <input
                value={formData.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Sarah Jenkins"
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={formData.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="sarah.jenkins@vantrix.local"
              />
            </label>

            <label>
              <span>Employee ID</span>
              <input
                value={formData.employeeId}
                onChange={(event) => updateField('employeeId', event.target.value)}
                placeholder="EMP-008"
              />
            </label>

            <label>
              <span>Role</span>
              <select value={formData.role} onChange={(event) => updateField('role', event.target.value)}>
                {availableRoles.map((roleName) => (
                  <option key={roleName} value={roleName}>{roleName}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Register Access</span>
              <select value={formData.registerAccess} onChange={(event) => updateField('registerAccess', event.target.value)}>
                <option value="None">None</option>
                <option value="Register #01">Register #01</option>
                <option value="Register #02">Register #02</option>
                <option value="Register #03">Register #03</option>
                <option value="Register #04">Register #04</option>
                <option value="All Registers">All Registers</option>
              </select>
            </label>

            <label>
              <span>Status</span>
              <select value={formData.status} onChange={(event) => updateField('status', event.target.value)}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
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

export default UserFormModal

import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'

const defaultForm = {
  name: '',
  email: '',
  username: '',
  password: '',
  employeeId: '',
  role: 'Cashier',
  roleId: null,
  registerAccess: 'Register #01',
  status: 'Active',
}

const defaultRoleList = ['Admin', 'Manager', 'Cashier']

function isAdminRoleName(name) {
  const clean = String(name || '').trim().toLowerCase()
  return clean === 'admin' || clean === 'administrator'
}

function UserFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialValues = null,
  mode = 'add',
  existingUsers = [],
  roleOptions = defaultRoleList,
  isSubmitting = false,
  externalError = '',
  canAssignRole = true,
  isCurrentUserAdmin = false,
  isEditingSelf = false,
}) {
  const [formData, setFormData] = useState(defaultForm)
  const [error, setError] = useState('')

  const availableRoles = useMemo(() => {
    const rawList =
      !Array.isArray(roleOptions) || roleOptions.length === 0
        ? defaultRoleList.map((r, i) => ({ id: i + 1, name: r, code: r }))
        : roleOptions.map((r, i) => {
            if (typeof r === 'object' && r !== null) {
              return {
                id: r.id ?? i + 1,
                name: r.name,
                code: r.code || r.name,
              }
            }
            return { id: i + 1, name: r, code: r }
          })

    // Only an Admin can assign the Admin role to a user
    const filtered = rawList.filter((r) => {
      if (isAdminRoleName(r.name) && !isCurrentUserAdmin) {
        const currentTargetRole =
          typeof initialValues?.role === 'object' ? initialValues?.role?.name : initialValues?.role
        return isAdminRoleName(currentTargetRole)
      }
      return true
    })

    if (initialValues?.role && !filtered.some((r) => r.name === initialValues.role)) {
      filtered.push({
        id: initialValues.roleId ?? 99,
        name: initialValues.role,
        code: initialValues.roleCode || initialValues.role,
      })
    }

    return filtered
  }, [roleOptions, initialValues, isCurrentUserAdmin])

  const normalizedInitialValues = useMemo(() => {
    if (!initialValues) return null

    return {
      ...defaultForm,
      ...initialValues,
      name: initialValues.fullName || initialValues.name || '',
      username: initialValues.username || '',
      password: '',
      employeeId: initialValues.employeeCode || initialValues.employeeId || '',
      role: typeof initialValues.role === 'object' ? initialValues.role?.name : initialValues.role || 'Cashier',
      roleId: typeof initialValues.role === 'object' ? initialValues.role?.id : initialValues.roleId || null,
    }
  }, [initialValues])

  useEffect(() => {
    if (!isOpen) {
      setFormData(defaultForm)
      setError('')
      return
    }

    if (normalizedInitialValues) {
      setFormData(normalizedInitialValues)
    } else {
      const defaultRoleObj = availableRoles.find((r) => r.name === 'Cashier') || availableRoles[0]
      setFormData({
        ...defaultForm,
        role: defaultRoleObj?.name || 'Cashier',
        roleId: defaultRoleObj?.id || null,
      })
    }
    setError('')
  }, [isOpen, normalizedInitialValues, availableRoles])

  if (!isOpen) return null

  const updateField = (field, value) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }))

    if (error) setError('')
  }

  const handleRoleChange = (roleName) => {
    const matched = availableRoles.find((r) => r.name === roleName)
    setFormData((current) => ({
      ...current,
      role: roleName,
      roleId: matched?.id ?? current.roleId,
    }))
    if (error) setError('')
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (isSubmitting) return

    const cleanedName = formData.name.trim()
    const cleanedEmail = formData.email.trim()
    const cleanedUsername = (formData.username || '').trim()
    const cleanedPassword = formData.password || ''
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

    if (mode === 'add' && cleanedPassword && cleanedPassword.length < 8) {
      setError('Initial password must be at least 8 characters long.')
      return
    }

    if (!cleanedEmployeeId) {
      setError('Employee ID is required.')
      return
    }

    const duplicateEmployeeId = existingUsers.some((user) => {
      const normalizedExistingId = String(user.employeeId || user.employeeCode || '').trim().toLowerCase()
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

    const matchedRole = availableRoles.find((r) => r.name === formData.role)
    const resolvedRoleId = formData.roleId || matchedRole?.id || null

    onSubmit({
      ...formData,
      fullName: cleanedName,
      name: cleanedName,
      email: cleanedEmail,
      username: cleanedUsername,
      password: cleanedPassword,
      employeeCode: cleanedEmployeeId,
      employeeId: cleanedEmployeeId,
      role: formData.role,
      roleId: resolvedRoleId,
      registerAccess: formData.registerAccess,
      status: formData.status,
    })
  }

  const title = mode === 'edit' ? 'Edit User' : 'Add User'
  const actionLabel = isSubmitting
    ? mode === 'edit' ? 'Saving...' : 'Creating User...'
    : mode === 'edit' ? 'Save User' : 'Create User'

  const displayedError = error || externalError

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="product-form-modal user-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-modal__header">
          <div>
            <span className="section-label">Staff Management</span>
            <h3>{title}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose} disabled={isSubmitting}>×</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Full Name</span>
              <input
                value={formData.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Sarah Jenkins"
                disabled={isSubmitting}
                required
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={formData.email}
                onChange={(event) => updateField('email', event.target.value)}
                placeholder="sarah.jenkins@vantrix.local"
                disabled={isSubmitting}
                required
              />
            </label>

            {mode === 'add' && (
              <>
                <label>
                  <span>Username (Optional)</span>
                  <input
                    value={formData.username}
                    onChange={(event) => updateField('username', event.target.value)}
                    placeholder="sarah_j"
                    disabled={isSubmitting}
                  />
                </label>

                <label>
                  <span>Initial Password</span>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(event) => updateField('password', event.target.value)}
                    placeholder="Min. 8 characters (for immediate login)"
                    disabled={isSubmitting}
                  />
                </label>
              </>
            )}

            <label>
              <span>Employee ID</span>
              <input
                value={formData.employeeId}
                onChange={(event) => updateField('employeeId', event.target.value)}
                placeholder="EMP-008"
                disabled={isSubmitting}
                required
              />
            </label>

            <label>
              <span>Role</span>
              <select
                value={formData.role}
                onChange={(event) => handleRoleChange(event.target.value)}
                disabled={isSubmitting || !canAssignRole || isEditingSelf}
                title={
                  isEditingSelf
                    ? 'You cannot change your own Administrator role'
                    : !canAssignRole
                    ? 'Requires users.assign_role permission'
                    : undefined
                }
              >
                {availableRoles.map((role) => (
                  <option key={role.id || role.name} value={role.name}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Register Access</span>
              <select
                value={formData.registerAccess}
                onChange={(event) => updateField('registerAccess', event.target.value)}
                disabled={isSubmitting}
              >
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
              <select
                value={formData.status}
                onChange={(event) => updateField('status', event.target.value)}
                disabled={isSubmitting || isEditingSelf}
                title={isEditingSelf ? 'You cannot deactivate your own account' : undefined}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>

          {displayedError && <div className="field-error">{displayedError}</div>}

          <div className="product-form__actions">
            <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {actionLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default UserFormModal


import { useEffect, useState } from 'react'
import Button from './ui/Button'
import { PERMISSION_CATEGORIES, registerCustomRolePermissions } from '../auth/permissions'

const defaultRoleForm = {
  name: '',
  code: '',
  description: '',
  permissions: [
    'pos.use',
    'orders.view',
    'invoices.view',
    'products.view',
    'inventory.view',
    'dashboard.view',
  ],
}

function normalizeRoleCode(text) {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function RoleFormModal({ isOpen, onClose, onSuccess, existingRoles = [] }) {
  const [formData, setFormData] = useState(defaultRoleForm)
  const [isCodeManuallyEdited, setIsCodeManuallyEdited] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      setFormData(defaultRoleForm)
      setIsCodeManuallyEdited(false)
      setError('')
      setIsSubmitting(false)
      return
    }

    setFormData(defaultRoleForm)
    setIsCodeManuallyEdited(false)
    setError('')
    setIsSubmitting(false)
  }, [isOpen])

  if (!isOpen) return null

  const handleNameChange = (event) => {
    const value = event.target.value
    setFormData((prev) => ({
      ...prev,
      name: value,
      code: isCodeManuallyEdited ? prev.code : normalizeRoleCode(value),
    }))
    if (error) setError('')
  }

  const handleCodeChange = (event) => {
    setIsCodeManuallyEdited(true)
    setFormData((prev) => ({
      ...prev,
      code: normalizeRoleCode(event.target.value),
    }))
    if (error) setError('')
  }

  const handleDescriptionChange = (event) => {
    setFormData((prev) => ({
      ...prev,
      description: event.target.value,
    }))
  }

  const togglePermission = (key) => {
    setFormData((prev) => {
      const exists = prev.permissions.includes(key)
      const updated = exists
        ? prev.permissions.filter((p) => p !== key)
        : [...prev.permissions, key]
      return { ...prev, permissions: updated }
    })
    if (error) setError('')
  }

  const allKeys = PERMISSION_CATEGORIES.flatMap((cat) => cat.permissions.map((p) => p.key))
  const areAllSelected = allKeys.length > 0 && allKeys.every((key) => formData.permissions.includes(key))

  const handleToggleAll = () => {
    if (areAllSelected) {
      setFormData((prev) => ({ ...prev, permissions: [] }))
    } else {
      setFormData((prev) => ({ ...prev, permissions: [...allKeys] }))
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const cleanedName = formData.name.trim()
    const cleanedCode = formData.code.trim()

    if (!cleanedName) {
      setError('Role name is required.')
      return
    }

    if (cleanedName.length < 2) {
      setError('Role name must be at least 2 characters.')
      return
    }

    if (!cleanedCode) {
      setError('Role code is required (e.g. SUPERVISOR).')
      return
    }

    // Check duplicate role name
    const isDuplicate = existingRoles.some((existing) => {
      const existingName = typeof existing === 'string' ? existing : existing?.name
      return existingName?.trim().toLowerCase() === cleanedName.toLowerCase()
    })

    if (isDuplicate) {
      setError(`A role named "${cleanedName}" already exists. Please choose a different name.`)
      return
    }

    if (formData.permissions.length === 0) {
      setError('Please assign at least one permission to this role.')
      return
    }

    setIsSubmitting(true)
    setError('')

    const payload = {
      name: cleanedName,
      code: cleanedCode,
      description: formData.description.trim(),
      permissions: formData.permissions,
    }

    try {
      // Attempt backend API call
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        const responseData = await res.json().catch(() => null)
        const createdRole = responseData?.data?.role || payload

        // Register dynamic role permissions in frontend matrix
        registerCustomRolePermissions(createdRole.name, createdRole.permissions || payload.permissions)

        onSuccess(createdRole)
        onClose()
        return
      }

      // If backend responded with 401/403 or specific validation error
      const errData = await res.json().catch(() => null)
      if (res.status === 400 || res.status === 409) {
        setError(errData?.message || 'Failed to create role. Please check details.')
        setIsSubmitting(false)
        return
      }

      // Fallback: in local dev or mock session without auth headers, create locally
      registerCustomRolePermissions(cleanedName, formData.permissions)
      onSuccess(payload)
      onClose()
    } catch {
      // Network or offline fallback: register locally so workflow is uninterrupted
      registerCustomRolePermissions(cleanedName, formData.permissions)
      onSuccess(payload)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="product-form-modal role-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="product-form-modal__header">
          <div>
            <span className="section-label">Role & Access Control</span>
            <h3>Create New Role</h3>
            <p className="role-modal__subtitle">
              Define a new business role and configure functional permissions.
            </p>
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Role Name *</span>
              <input
                type="text"
                placeholder="e.g. Supervisor, Shift Lead"
                value={formData.name}
                onChange={handleNameChange}
                disabled={isSubmitting}
                autoFocus
              />
            </label>

            <label>
              <span>Role Code *</span>
              <input
                type="text"
                placeholder="e.g. SUPERVISOR"
                value={formData.code}
                onChange={handleCodeChange}
                disabled={isSubmitting}
              />
            </label>
          </div>

          <label>
            <span>Description</span>
            <input
              type="text"
              placeholder="e.g. Floor supervisor for shift approvals, returns and voids"
              value={formData.description}
              onChange={handleDescriptionChange}
              disabled={isSubmitting}
            />
          </label>

          <div className="role-permissions-section">
            <div className="role-permissions-header">
              <div>
                <span className="role-permissions-title">Role Permissions</span>
                <span className="role-permissions-badge">
                  {formData.permissions.length} selected
                </span>
              </div>
              <button
                type="button"
                className="role-permissions-select-all"
                onClick={handleToggleAll}
              >
                {areAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="role-permissions-groups">
              {PERMISSION_CATEGORIES.map((cat) => {
                const catKeys = cat.permissions.map((p) => p.key)
                const selectedInCat = catKeys.filter((k) => formData.permissions.includes(k)).length

                return (
                  <div key={cat.category} className="role-perm-group">
                    <div className="role-perm-group__title">
                      <strong>{cat.category}</strong>
                      <span className="role-perm-group__count">
                        {selectedInCat}/{catKeys.length}
                      </span>
                    </div>

                    <div className="role-perm-group__items">
                      {cat.permissions.map((perm) => {
                        const checked = formData.permissions.includes(perm.key)
                        return (
                          <label
                            key={perm.key}
                            className={`role-perm-chip ${checked ? 'role-perm-chip--active' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePermission(perm.key)}
                              disabled={isSubmitting}
                            />
                            <div className="role-perm-chip__content">
                              <span className="role-perm-chip__label">{perm.label}</span>
                              <small className="role-perm-chip__desc">{perm.description}</small>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {error && <div className="field-error">{error}</div>}

          <div className="product-form__actions">
            <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating Role...' : '+ Create Role'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default RoleFormModal

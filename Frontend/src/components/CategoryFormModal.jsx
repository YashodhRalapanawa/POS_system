import { useEffect, useState } from 'react'
import Button from './ui/Button'

const defaultForm = {
  name: '',
  code: '',
  description: '',
  status: 'Active',
}

function CategoryFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialValues = null,
  mode = 'add',
  isSubmitting = false,
  externalError = '',
}) {
  const [formData, setFormData] = useState(defaultForm)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setFormData(defaultForm)
      setError('')
      return
    }

    if (initialValues) {
      setFormData({
        name: initialValues.name || '',
        code: initialValues.code || '',
        description: initialValues.description || '',
        status: initialValues.status || (initialValues.isActive ? 'Active' : 'Inactive'),
      })
    } else {
      setFormData(defaultForm)
    }
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
    if (isSubmitting) return

    const cleanedName = formData.name.trim()
    if (!cleanedName) {
      setError('Category name is required.')
      return
    }

    const cleanedCode = (formData.code || '').trim().toUpperCase()

    onSubmit({
      ...formData,
      name: cleanedName,
      code: cleanedCode || undefined,
      description: formData.description.trim(),
      status: formData.status,
      isActive: formData.status === 'Active',
    })
  }

  const title = mode === 'edit' ? 'Edit Category' : 'Add Category'
  const actionLabel = isSubmitting
    ? mode === 'edit' ? 'Saving...' : 'Creating...'
    : mode === 'edit' ? 'Save Changes' : 'Create Category'

  const displayedError = error || externalError

  return (
    <div className="modal-backdrop" onClick={!isSubmitting ? onClose : undefined}>
      <div className="product-form-modal category-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-modal__header">
          <div>
            <span className="section-label">Category Management</span>
            <h3>{title}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose} disabled={isSubmitting}>×</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Category Name</span>
              <input
                value={formData.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="e.g. Electronics"
                disabled={isSubmitting}
                required
              />
            </label>

            <label>
              <span>Category Code (Optional)</span>
              <input
                value={formData.code}
                onChange={(event) => updateField('code', event.target.value)}
                placeholder="e.g. ELEC"
                disabled={isSubmitting}
              />
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

            <label style={{ gridColumn: '1 / -1' }}>
              <span>Description</span>
              <input
                value={formData.description}
                onChange={(event) => updateField('description', event.target.value)}
                placeholder="Describe the category and its inventory focus"
                disabled={isSubmitting}
              />
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

export default CategoryFormModal

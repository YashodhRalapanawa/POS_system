import { useEffect, useState } from 'react'
import Button from './ui/Button'

const defaultForm = {
  name: '',
  description: '',
  status: 'Active',
}

function CategoryFormModal({ isOpen, onClose, onSubmit, initialValues = null, mode = 'add' }) {
  const [formData, setFormData] = useState(defaultForm)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setFormData(defaultForm)
      setError('')
      return
    }

    setFormData(initialValues ? { ...initialValues } : defaultForm)
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
    if (!cleanedName) {
      setError('Category name is required.')
      return
    }

    onSubmit({
      ...formData,
      name: cleanedName,
      description: formData.description.trim(),
    })
  }

  const title = mode === 'edit' ? 'Edit Category' : 'Add Category'
  const actionLabel = mode === 'edit' ? 'Save Changes' : 'Create Category'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="product-form-modal category-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-modal__header">
          <div>
            <span className="section-label">Category Management</span>
            <h3>{title}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Category Name</span>
              <input
                value={formData.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="e.g. Electronics"
              />
            </label>

            <label>
              <span>Status</span>
              <select value={formData.status} onChange={(event) => updateField('status', event.target.value)}>
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

export default CategoryFormModal

import Badge from './ui/Badge'
import Button from './ui/Button'

function CategoryDetailsModal({ category, onClose }) {
  if (!category) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal category-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Category Details</span>
            <h3>{category.name}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__body">
          <div className="modal__row">
            <span>Status</span>
            <strong>
              <Badge tone={category.status === 'Active' ? 'success' : 'warning'}>{category.status}</Badge>
            </strong>
          </div>

          <div className="modal__row">
            <span>Description</span>
            <strong>{category.description}</strong>
          </div>

          <div className="modal__row">
            <span>Products in this category</span>
            <strong>{category.productCount}</strong>
          </div>

          <div className="modal__row">
            <span>Created</span>
            <strong>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(category.createdAt))}</strong>
          </div>

          <div className="modal__row">
            <span>Updated</span>
            <strong>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(category.updatedAt))}</strong>
          </div>

        </div>

        <div className="modal__actions">
          <Button variant="primary" type="button" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

export default CategoryDetailsModal

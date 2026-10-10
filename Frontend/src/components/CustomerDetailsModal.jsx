import Badge from './ui/Badge'
import Button from './ui/Button'

function formatDate(value) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function CustomerDetailsModal({ customer, onClose }) {
  if (!customer) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal customer-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Customer Details</span>
            <h3>{customer.name}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__body">
          <div className="modal__row">
            <span>Customer Code</span>
            <strong>{customer.code}</strong>
          </div>

          <div className="modal__row">
            <span>Customer Type</span>
            <strong>{customer.customerType}</strong>
          </div>

          <div className="modal__row">
            <span>Status</span>
            <strong>
              <Badge tone={customer.status === 'Active' ? 'success' : 'warning'}>{customer.status}</Badge>
            </strong>
          </div>

          <div className="modal__row">
            <span>Phone</span>
            <strong>{customer.phone || '—'}</strong>
          </div>

          <div className="modal__row">
            <span>Email</span>
            <strong>{customer.email || '—'}</strong>
          </div>

          <div className="modal__row">
            <span>Address</span>
            <strong>{customer.address || '—'}</strong>
          </div>

          <div className="modal__row">
            <span>City</span>
            <strong>{customer.city || '—'}</strong>
          </div>

          <div className="modal__row">
            <span>Country</span>
            <strong>{customer.country || '—'}</strong>
          </div>

          <div className="modal__row">
            <span>Orders</span>
            <strong>{customer.orderCount}</strong>
          </div>

          <div className="modal__row">
            <span>Created</span>
            <strong>{formatDate(customer.createdAt)}</strong>
          </div>

          <div className="modal__row">
            <span>Updated</span>
            <strong>{formatDate(customer.updatedAt)}</strong>
          </div>

          <div className="modal__row modal__row--total">
            <span>Sales Relationship</span>
            <strong>Orders: {customer.orderCount}</strong>
          </div>
        </div>

        <div className="modal__actions">
          <Button variant="primary" type="button" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

export default CustomerDetailsModal

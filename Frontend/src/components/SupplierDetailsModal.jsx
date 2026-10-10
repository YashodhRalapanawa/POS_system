import Badge from './ui/Badge'
import Button from './ui/Button'

function SupplierDetailsModal({ supplier, onClose }) {
  if (!supplier) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal supplier-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Supplier Details</span>
            <h3>{supplier.name}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__body">
          <div className="modal__row">
            <span>Supplier Code</span>
            <strong>{supplier.code}</strong>
          </div>

          <div className="modal__row">
            <span>Status</span>
            <strong>
              <Badge tone={supplier.status === 'Active' ? 'success' : 'warning'}>{supplier.status}</Badge>
            </strong>
          </div>

          <div className="modal__row">
            <span>Contact Person</span>
            <strong>{supplier.contactPerson}</strong>
          </div>

          <div className="modal__row">
            <span>Phone</span>
            <strong>{supplier.phone}</strong>
          </div>

          <div className="modal__row">
            <span>Email</span>
            <strong>{supplier.email}</strong>
          </div>

          <div className="modal__row">
            <span>Supplier Type</span>
            <strong>{supplier.supplierType}</strong>
          </div>

          <div className="modal__row">
            <span>Address</span>
            <strong>{supplier.address}</strong>
          </div>

          <div className="modal__row">
            <span>City</span>
            <strong>{supplier.city}</strong>
          </div>

          <div className="modal__row">
            <span>Country</span>
            <strong>{supplier.country}</strong>
          </div>

          <div className="modal__row">
            <span>Products Supplied</span>
            <strong>{supplier.productCount}</strong>
          </div>

          <div className="modal__row">
            <span>Created</span>
            <strong>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(supplier.createdAt))}</strong>
          </div>

          <div className="modal__row">
            <span>Updated</span>
            <strong>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(supplier.updatedAt))}</strong>
          </div>

          <div className="modal__row modal__row--total">
            <span>Catalog Relationship</span>
            <strong>Products supplied: {supplier.productCount}</strong>
          </div>
        </div>

        <div className="modal__actions">
          <Button variant="primary" type="button" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

export default SupplierDetailsModal

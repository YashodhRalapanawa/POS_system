import Badge from './ui/Badge'
import Button from './ui/Button'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function formatDate(value) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function ReturnDetailsModal({ returnEntry, onClose }) {
  if (!returnEntry) return null

  const inventoryImpact = returnEntry.items ?? []

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal return-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Return Details</span>
            <h3>{returnEntry.id}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__body">
          <div className="modal__row">
            <span>Return ID</span>
            <strong>{returnEntry.id}</strong>
          </div>
          <div className="modal__row">
            <span>Original Order ID</span>
            <strong>{returnEntry.orderId}</strong>
          </div>
          <div className="modal__row">
            <span>Customer</span>
            <strong>{returnEntry.customerName}</strong>
          </div>
          <div className="modal__row">
            <span>Created Date</span>
            <strong>{formatDate(returnEntry.createdAt)}</strong>
          </div>
          <div className="modal__row">
            <span>Status</span>
            <strong>
              <Badge tone={returnEntry.status === 'Completed' ? 'success' : returnEntry.status === 'Approved' ? 'warning' : returnEntry.status === 'Rejected' ? 'danger' : 'warning'}>{returnEntry.status}</Badge>
            </strong>
          </div>
          <div className="modal__row">
            <span>Refund Method</span>
            <strong>{returnEntry.refundMethod}</strong>
          </div>
          <div className="modal__row">
            <span>Return Reason</span>
            <strong>{returnEntry.reason}</strong>
          </div>
          <div className="modal__row">
            <span>Refund Amount</span>
            <strong>{formatCurrency(returnEntry.refundAmount)}</strong>
          </div>
        </div>

        <div className="order-items-summary">
          <h4>Returned Items</h4>
          <div className="order-items-summary__header order-items-summary__row return-items-summary__row">
            <span>Product</span>
            <span>SKU</span>
            <span>Qty</span>
            <span>Unit Price</span>
            <span>Refund</span>
          </div>

          {inventoryImpact.map((item) => (
            <div key={`${returnEntry.id}-${item.sku}`} className="order-items-summary__row return-items-summary__row">
              <span>{item.name}</span>
              <span>{item.sku}</span>
              <span>{item.quantity}</span>
              <span>{formatCurrency(item.unitPrice)}</span>
              <span>{formatCurrency(item.refundAmount)}</span>
            </div>
          ))}
        </div>

        <div className="order-items-summary">
          <h4>Inventory Impact</h4>
          {inventoryImpact.map((item) => (
            <div key={`${returnEntry.id}-impact-${item.sku}`} className="modal__row">
              <span>{item.quantity} × {item.name}</span>
              <strong>Inventory adjustment: +{item.quantity}</strong>
            </div>
          ))}
        </div>

        <div className="order-items-summary">
          <h4>Refund Summary</h4>
          <div className="modal__row">
            <span>Subtotal</span>
            <strong>{formatCurrency(returnEntry.subtotal)}</strong>
          </div>
          <div className="modal__row">
            <span>Tax</span>
            <strong>{formatCurrency(returnEntry.tax)}</strong>
          </div>
          <div className="modal__row modal__row--total">
            <span>Total Refund</span>
            <strong>{formatCurrency(returnEntry.refundAmount)}</strong>
          </div>
        </div>

        <div className="modal__actions">
          <Button variant="primary" type="button" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

export default ReturnDetailsModal

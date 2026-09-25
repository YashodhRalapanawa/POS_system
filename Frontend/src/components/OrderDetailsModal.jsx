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

function OrderDetailsModal({ order, onClose }) {
  if (!order) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal order-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Order Details</span>
            <h3>{order.id}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__body">
          <div className="modal__row">
            <span>Invoice Number</span>
            <strong>{order.invoiceNumber}</strong>
          </div>

          <div className="modal__row">
            <span>Customer</span>
            <strong>{order.customerName}</strong>
          </div>

          <div className="modal__row">
            <span>Cashier</span>
            <strong>{order.cashier}</strong>
          </div>

          <div className="modal__row">
            <span>Created Date</span>
            <strong>{formatDate(order.createdAt)}</strong>
          </div>

          <div className="modal__row">
            <span>Status</span>
            <strong>
              <Badge tone={order.status === 'Completed' ? 'success' : order.status === 'Cancelled' ? 'danger' : 'warning'}>{order.status}</Badge>
            </strong>
          </div>

          <div className="modal__row">
            <span>Payment Method</span>
            <strong>{order.paymentMethod}</strong>
          </div>

          <div className="modal__row modal__row--total">
            <span>Order Summary</span>
            <strong>{formatCurrency(order.total)}</strong>
          </div>

          <div className="modal__row">
            <span>Subtotal</span>
            <strong>{formatCurrency(order.subtotal)}</strong>
          </div>

          <div className="modal__row">
            <span>Discount</span>
            <strong>{formatCurrency(order.discount)}</strong>
          </div>

          <div className="modal__row">
            <span>Tax</span>
            <strong>{formatCurrency(order.tax)}</strong>
          </div>

          <div className="modal__row modal__row--total">
            <span>Total</span>
            <strong>{formatCurrency(order.total)}</strong>
          </div>
        </div>

        <div className="order-items-summary">
          <h4>Items</h4>
          <div className="order-items-summary__header order-items-summary__row">
            <span>Item</span>
            <span>Qty</span>
            <span>Unit Price</span>
            <span>Line Total</span>
          </div>

          {order.items.map((item) => (
            <div key={`${order.id}-${item.name}`} className="order-items-summary__row">
              <span>{item.name}</span>
              <span>{item.quantity}</span>
              <span>{formatCurrency(item.unitPrice)}</span>
              <span>{formatCurrency(item.lineTotal)}</span>
            </div>
          ))}
        </div>

        <div className="modal__actions">
          <Button variant="primary" type="button" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

export default OrderDetailsModal

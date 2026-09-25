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

function InvoiceDetailsModal({ invoice, onClose }) {
  if (!invoice) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal invoice-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Invoice Details</span>
            <h3>{invoice.invoiceNumber}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__body">
          <div className="modal__row">
            <span>Invoice Number</span>
            <strong>{invoice.invoiceNumber}</strong>
          </div>
          <div className="modal__row">
            <span>Order ID</span>
            <strong>{invoice.orderId}</strong>
          </div>
          <div className="modal__row">
            <span>Customer</span>
            <strong>{invoice.customerName}</strong>
          </div>
          <div className="modal__row">
            <span>Customer Type</span>
            <strong>{invoice.customerType}</strong>
          </div>
          <div className="modal__row">
            <span>Invoice Date</span>
            <strong>{formatDate(invoice.invoiceDate)}</strong>
          </div>
          <div className="modal__row">
            <span>Due Date</span>
            <strong>{formatDate(invoice.dueDate)}</strong>
          </div>
          <div className="modal__row">
            <span>Payment Method</span>
            <strong>{invoice.paymentMethod}</strong>
          </div>
          <div className="modal__row">
            <span>Payment Status</span>
            <strong>
              <Badge tone={invoice.paymentStatus === 'Paid' ? 'success' : invoice.paymentStatus === 'Pending' ? 'warning' : 'danger'}>{invoice.paymentStatus}</Badge>
            </strong>
          </div>
        </div>

        <div className="order-items-summary">
          <h4>Invoice Summary</h4>
          <div className="modal__row">
            <span>Subtotal</span>
            <strong>{formatCurrency(invoice.subtotal)}</strong>
          </div>
          <div className="modal__row">
            <span>Discount</span>
            <strong>{formatCurrency(invoice.discount)}</strong>
          </div>
          <div className="modal__row">
            <span>Tax</span>
            <strong>{formatCurrency(invoice.tax)}</strong>
          </div>
          <div className="modal__row modal__row--total">
            <span>Total</span>
            <strong>{formatCurrency(invoice.total)}</strong>
          </div>
        </div>

        <div className="order-items-summary">
          <h4>Invoice Items</h4>
          <div className="order-items-summary__header order-items-summary__row">
            <span>Item</span>
            <span>SKU</span>
            <span>Qty</span>
            <span>Unit Price</span>
            <span>Tax</span>
            <span>Line Total</span>
          </div>

          {invoice.items.map((item) => (
            <div key={`${invoice.id}-${item.name}`} className="order-items-summary__row invoice-items-summary__row">
              <span>{item.name}</span>
              <span>{item.sku}</span>
              <span>{item.quantity}</span>
              <span>{formatCurrency(item.unitPrice)}</span>
              <span>{item.taxRate}%</span>
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

export default InvoiceDetailsModal

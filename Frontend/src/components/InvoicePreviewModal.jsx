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

function InvoicePreviewModal({ invoice, order, onClose }) {
  const activeInvoice = invoice ?? order ?? null

  if (!activeInvoice) return null

  const invoiceNumber = activeInvoice.invoiceNumber ?? activeInvoice.id
  const orderId = activeInvoice.orderId ?? activeInvoice.id
  const customerName = activeInvoice.customerName ?? activeInvoice.customer ?? 'Walk-in Customer'
  const customerAddress = activeInvoice.customerAddress ?? 'Main Store'
  const customerPhone = activeInvoice.customerPhone ?? '—'
  const customerEmail = activeInvoice.customerEmail ?? '—'
  const invoiceDate = activeInvoice.invoiceDate ?? activeInvoice.createdAt ?? new Date().toISOString()
  const dueDate = activeInvoice.dueDate ?? activeInvoice.createdAt ?? new Date().toISOString()
  const paymentMethod = activeInvoice.paymentMethod ?? 'Card'
  const paymentStatus = activeInvoice.paymentStatus ?? activeInvoice.status ?? 'Paid'
  const subtotal = activeInvoice.subtotal ?? 0
  const discount = activeInvoice.discount ?? 0
  const tax = activeInvoice.tax ?? 0
  const total = activeInvoice.total ?? subtotal - discount + tax
  const items = activeInvoice.items ?? []

  const handlePrintPreview = () => {
    if (typeof window !== 'undefined') {
      window.alert('Print preview is available when the reporting layer is connected.')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal invoice-preview-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Invoice Preview</span>
            <h3>VANTRIX POS</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="invoice-preview">
          <div className="invoice-preview__header">
            <div>
              <span>Invoice</span>
              <strong>{invoiceNumber}</strong>
            </div>
            <div>
              <span>Invoice Date</span>
              <strong>{formatDate(invoiceDate)}</strong>
            </div>
            <div>
              <span>Due Date</span>
              <strong>{formatDate(dueDate)}</strong>
            </div>
          </div>

          <div className="invoice-preview__bill-to">
            <div className="invoice-preview__bill-to-label">Bill To</div>
            <strong>{customerName}</strong>
            <span>{customerAddress}</span>
            <span>{customerPhone}</span>
            <span>{customerEmail}</span>
          </div>

          <div className="invoice-preview__meta">
            <div>
              <span>Order</span>
              <strong>{orderId}</strong>
            </div>
            <div>
              <span>Payment Method</span>
              <strong>{paymentMethod}</strong>
            </div>
            <div>
              <span>Payment Status</span>
              <strong>{paymentStatus}</strong>
            </div>
          </div>

          <div className="invoice-preview__line-items">
            <div className="invoice-preview__row invoice-preview__row--header">
              <span>Item</span>
              <span>Qty</span>
              <span>Unit Price</span>
              <span>Tax</span>
              <span>Amount</span>
            </div>

            {items.map((item, index) => (
              <div key={`${invoiceNumber}-${item.name ?? item.sku ?? index}`} className="invoice-preview__row">
                <span>{item.name}</span>
                <span>{item.quantity}</span>
                <span>{formatCurrency(item.unitPrice)}</span>
                <span>{item.taxRate ?? 8}%</span>
                <span>{formatCurrency(item.lineTotal ?? item.unitPrice * item.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="invoice-preview__totals">
            <div className="modal__row">
              <span>Subtotal</span>
              <strong>{formatCurrency(subtotal)}</strong>
            </div>
            <div className="modal__row">
              <span>Discount</span>
              <strong>{formatCurrency(discount)}</strong>
            </div>
            <div className="modal__row">
              <span>Tax</span>
              <strong>{formatCurrency(tax)}</strong>
            </div>
            <div className="modal__row modal__row--total">
              <span>Total</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
          </div>

          <div className="invoice-preview__footer">
            Thank you for your business.
          </div>
        </div>

        <div className="modal__actions">
          <Button variant="secondary" type="button" onClick={onClose}>Close</Button>
          <Button variant="primary" type="button" onClick={handlePrintPreview}>Print Preview</Button>
        </div>
      </div>
    </div>
  )
}

export default InvoicePreviewModal

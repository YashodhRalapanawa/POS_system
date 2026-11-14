import Button from './ui/Button'
import { useCurrency } from '../context/CurrencyContext'

function formatDate(value) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function InvoicePreviewModal({ invoice, order, onClose }) {
  const { formatCurrency } = useCurrency()
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
    const printWindow = window.open('', '_blank', 'width=900,height=800')
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups for this site to print invoice.')
      return
    }

    const itemsRows = items.map((it) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #1e293b;">
          <strong>${it.name || it.productName || 'Item'}</strong>
          ${it.sku ? `<div style="font-size: 11px; color: #64748b;">SKU: ${it.sku}</div>` : ''}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 13px;">${it.quantity}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px;">${formatCurrency(it.unitPrice)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 13px;">${it.taxRate ?? 0}%</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px; font-weight: 600;">${formatCurrency(it.lineTotal ?? it.unitPrice * it.quantity)}</td>
      </tr>
    `).join('')

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice - ${invoiceNumber}</title>
        <style>
          @page { size: A4 portrait; margin: 15mm; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; font-size: 13px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; }
          .brand-title { font-size: 24px; font-weight: 800; color: #1e40af; margin: 0; }
          .brand-sub { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-top: 4px; }
          .inv-title { text-align: right; font-size: 13px; color: #475569; }
          .inv-title strong { font-size: 20px; color: #0f172a; font-family: monospace; display: block; }
          .grid-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; }
          .meta-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 2px; }
          .meta-val { font-size: 13px; font-weight: 600; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f1f5f9; color: #475569; font-size: 11px; text-transform: uppercase; font-weight: 700; padding: 10px 12px; border-bottom: 1px solid #cbd5e1; }
          .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 30px; }
          .totals-table { width: 300px; border-collapse: collapse; }
          .totals-table td { padding: 6px 12px; border-bottom: 1px solid #e2e8f0; }
          .totals-table tr.total-row td { border-top: 2px solid #0f172a; border-bottom: none; font-size: 16px; font-weight: 800; color: #1e40af; }
          .footer { text-align: center; border-top: 1px dashed #cbd5e1; padding-top: 16px; font-size: 12px; color: #64748b; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; background: #dcfce7; color: #15803d; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="brand-title">VANTRIX POS</h1>
            <div class="brand-sub">Retail & Wholesale Operations</div>
          </div>
          <div class="inv-title">
            <span>INVOICE</span>
            <strong>${invoiceNumber}</strong>
            <div style="margin-top: 4px;">Status: <span class="badge">${paymentStatus}</span></div>
          </div>
        </div>

        <div class="grid-meta">
          <div>
            <div class="meta-label">Billed To</div>
            <div class="meta-val" style="font-size: 14px;">${customerName}</div>
            <div style="color: #64748b; font-size: 12px;">${customerAddress}</div>
            <div style="color: #64748b; font-size: 12px;">${customerPhone} • ${customerEmail}</div>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <div class="meta-label">Invoice Date</div>
              <div class="meta-val">${formatDate(invoiceDate)}</div>
            </div>
            <div>
              <div class="meta-label">Due Date</div>
              <div class="meta-val">${formatDate(dueDate)}</div>
            </div>
            <div>
              <div class="meta-label">Order Ref</div>
              <div class="meta-val" style="font-family: monospace;">${orderId}</div>
            </div>
            <div>
              <div class="meta-label">Payment Method</div>
              <div class="meta-val">${paymentMethod}</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align: left;">Item Description</th>
              <th style="text-align: center; width: 60px;">Qty</th>
              <th style="text-align: right; width: 110px;">Unit Price</th>
              <th style="text-align: center; width: 70px;">Tax</th>
              <th style="text-align: right; width: 120px;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows.length > 0 ? itemsRows : `
              <tr>
                <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">POS Sale Order Items (${orderId})</td>
                <td style="text-align: center; padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">1</td>
                <td style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">${formatCurrency(subtotal)}</td>
                <td style="text-align: center; padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">—</td>
                <td style="text-align: right; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${formatCurrency(subtotal)}</td>
              </tr>
            `}
          </tbody>
        </table>

        <div class="totals-wrap">
          <table class="totals-table">
            <tr>
              <td style="color: #64748b;">Subtotal</td>
              <td style="text-align: right; font-weight: 600;">${formatCurrency(subtotal)}</td>
            </tr>
            <tr>
              <td style="color: #64748b;">Discount</td>
              <td style="text-align: right; font-weight: 600; color: #dc2626;">-${formatCurrency(discount)}</td>
            </tr>
            <tr>
              <td style="color: #64748b;">Tax</td>
              <td style="text-align: right; font-weight: 600;">${formatCurrency(tax)}</td>
            </tr>
            <tr class="total-row">
              <td>Total Amount</td>
              <td style="text-align: right;">${formatCurrency(total)}</td>
            </tr>
          </table>
        </div>

        <div class="footer">
          <strong>Thank you for your business!</strong>
          <div style="font-size: 11px; margin-top: 4px;">For any questions regarding this invoice, please contact support.</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
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

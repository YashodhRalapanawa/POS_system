import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import InvoiceDetailsModal from './InvoiceDetailsModal'
import InvoicePreviewModal from './InvoicePreviewModal'
import { initialInvoices, invoiceStatusOptions, paymentMethodOptions, dateFilterOptions, customerTypeOptions } from '../data/mockInvoices'
import { paths } from '../routes'

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

function InvoicesPage() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState(initialInvoices)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [paymentFilter, setPaymentFilter] = useState('All Payment Methods')
  const [dateFilter, setDateFilter] = useState('All Dates')
  const [customerTypeFilter, setCustomerTypeFilter] = useState('All Customer Types')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null)
  const [previewInvoiceId, setPreviewInvoiceId] = useState(null)
  const [moreInvoiceId, setMoreInvoiceId] = useState(null)
  const [showExportMessage, setShowExportMessage] = useState(false)

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [invoice.invoiceNumber, invoice.orderId, invoice.customerName, invoice.customerCode]
          .join(' ')
          .toLowerCase()
          .includes(searchText)

      const matchesStatus = statusFilter === 'All Status' || invoice.status === statusFilter
      const matchesPayment = paymentFilter === 'All Payment Methods' || invoice.paymentMethod === paymentFilter
      const matchesCustomerType = customerTypeFilter === 'All Customer Types' || invoice.customerType === customerTypeFilter

      const invoiceDate = new Date(invoice.invoiceDate)
      const today = new Date()
      const diffDays = (today.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24)

      let matchesDate = true

      if (dateFilter === 'Today') {
        matchesDate = invoiceDate.toDateString() === today.toDateString()
      } else if (dateFilter === 'Last 7 Days') {
        matchesDate = diffDays >= 0 && diffDays <= 7
      } else if (dateFilter === 'Last 30 Days') {
        matchesDate = diffDays >= 0 && diffDays <= 30
      }

      return matchesSearch && matchesStatus && matchesPayment && matchesCustomerType && matchesDate
    })
  }, [invoices, search, statusFilter, paymentFilter, dateFilter, customerTypeFilter])

  const totalInvoices = invoices.length
  const paidInvoices = invoices.filter((invoice) => invoice.status === 'Paid').length
  const pendingInvoices = invoices.filter((invoice) => ['Pending', 'Overdue'].includes(invoice.status)).length
  const totalInvoiceValue = invoices.reduce((total, invoice) => total + Number(invoice.total), 0)

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null
  const previewInvoice = invoices.find((invoice) => invoice.id === previewInvoiceId) ?? null
  const moreInvoice = invoices.find((invoice) => invoice.id === moreInvoiceId) ?? null

  const getStatusTone = (status) => {
    if (status === 'Paid') return 'success'
    if (status === 'Pending' || status === 'Overdue') return 'warning'
    if (status === 'Cancelled' || status === 'Refunded') return 'danger'
    return 'warning'
  }

  const handleMarkInvoicePaid = (invoiceId) => {
    setInvoices((currentInvoices) =>
      currentInvoices.map((invoice) => {
        if (invoice.id !== invoiceId) return invoice

        return {
          ...invoice,
          status: 'Paid',
          paymentStatus: 'Paid',
        }
      }),
    )
    setMoreInvoiceId(null)
  }

  const handleCopyInvoiceNumber = async (invoiceNumber) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(invoiceNumber)
    }
    setMoreInvoiceId(null)
  }

  const handleExportClick = () => {
    setShowExportMessage(true)
  }

  return (
    <div className="products-page invoices-page">
      <header className="products-page__header invoices-page__header">
        <div>
          <span className="section-label">Billing & Receivables</span>
          <h2>Invoices</h2>
          <p>Manage sales invoices, payment status, and customer billing records.</p>
        </div>

        <div className="products-page__actions">
          <Button variant="secondary" type="button" onClick={handleExportClick}>Export</Button>
          <Button variant="primary" type="button" onClick={() => navigate(paths.pos)}>+ New Invoice</Button>
        </div>
      </header>

      <section className="products-kpis invoices-kpis">
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Invoices</span>
          <strong className="kpi-card__value small">{totalInvoices}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Paid Invoices</span>
          <strong className="kpi-card__value small">{paidInvoices}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Pending Invoices</span>
          <strong className="kpi-card__value small">{pendingInvoices}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Invoice Value</span>
          <strong className="kpi-card__value small">{formatCurrency(totalInvoiceValue)}</strong>
        </Card>
      </section>

      <Card className="products-toolbar-card invoices-toolbar-card">
        <div className="products-toolbar invoices-toolbar">
          <div className="products-toolbar__search">
            <input
              type="text"
              placeholder="Search invoice number, order ID, customer..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {invoiceStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
            {paymentMethodOptions.map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>

          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
            {dateFilterOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select value={customerTypeFilter} onChange={(event) => setCustomerTypeFilter(event.target.value)}>
            {customerTypeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="products-table-card invoices-table-card">
        <div className="products-table-wrap">
          <table className="products-table invoices-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <div className="inventory-empty-state">
                      <strong>No invoices found</strong>
                      <span>Try adjusting your search or filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="invoice-number-cell">{invoice.invoiceNumber}</td>
                    <td className="invoice-order-cell">{invoice.orderId}</td>
                    <td>
                      <div className="customer-cell">
                        <div className="product-cell__dot" aria-hidden="true" />
                        <div>
                          <div className="customer-cell__name">{invoice.customerName}</div>
                          <div className="customer-cell__meta">{invoice.customerCode}</div>
                        </div>
                      </div>
                    </td>
                    <td className="invoice-date-cell">{formatDate(invoice.invoiceDate)}</td>
                    <td className="invoice-date-cell">{formatDate(invoice.dueDate)}</td>
                    <td className="invoice-amount-cell">{formatCurrency(invoice.total)}</td>
                    <td className="invoice-payment-cell">{invoice.paymentMethod}</td>
                    <td className="invoice-status-cell">
                      <Badge tone={getStatusTone(invoice.status)}>{invoice.status}</Badge>
                    </td>
                    <td>
                      <div className="invoice-actions">
                        <button type="button" onClick={() => setSelectedInvoiceId(invoice.id)}>View</button>
                        <button type="button" onClick={() => setPreviewInvoiceId(invoice.id)}>Preview</button>
                        <button type="button" onClick={() => setMoreInvoiceId(invoice.id)}>More</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showExportMessage && (
        <div className="modal-backdrop" onClick={() => setShowExportMessage(false)}>
          <div className="confirmation-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Export Invoice Report</h3>
            <p>Invoice export is available when backend reporting is connected.</p>
            <div className="confirmation-modal__actions">
              <Button variant="primary" type="button" onClick={() => setShowExportMessage(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      <InvoiceDetailsModal invoice={selectedInvoice} onClose={() => setSelectedInvoiceId(null)} />
      <InvoicePreviewModal invoice={previewInvoice} onClose={() => setPreviewInvoiceId(null)} />

      {moreInvoice && (
        <div className="modal-backdrop" onClick={() => setMoreInvoiceId(null)}>
          <div className="confirmation-modal invoice-more-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{moreInvoice.invoiceNumber}</h3>
            <div className="order-more-menu">
              <button type="button" onClick={() => { setSelectedInvoiceId(moreInvoice.id); setMoreInvoiceId(null) }}>View Invoice</button>
              <button type="button" onClick={() => { setPreviewInvoiceId(moreInvoice.id); setMoreInvoiceId(null) }}>Preview Invoice</button>
              <button type="button" onClick={() => { void handleCopyInvoiceNumber(moreInvoice.invoiceNumber) }}>Copy Invoice Number</button>
              {['Pending', 'Overdue'].includes(moreInvoice.status) && (
                <button type="button" onClick={() => handleMarkInvoicePaid(moreInvoice.id)}>Mark as Paid</button>
              )}
            </div>
            <div className="confirmation-modal__actions">
              <Button variant="secondary" type="button" onClick={() => setMoreInvoiceId(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default InvoicesPage

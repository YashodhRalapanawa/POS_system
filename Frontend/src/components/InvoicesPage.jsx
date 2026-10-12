import { useEffect, useRef, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import InvoiceDetailsModal from './InvoiceDetailsModal'
import InvoicePreviewModal from './InvoicePreviewModal'
import { getInvoices, getInvoiceById } from '../services/api'

function money(value, currency) {
  return currency ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value) : `${Number(value).toFixed(2)} (currency unavailable)`
}
const date = value => value ? new Date(value).toLocaleDateString() : '—'
function errorMessage(result) {
  if (result.status === 401) return 'A real signed-in session is required. Demo login cannot load invoices.'
  if (result.status === 403) return 'You do not have permission to view invoices for this store.'
  return result.data?.message || 'Unable to load invoices. Please try again.'
}

export default function InvoicesPage() {
  const [filters, setFilters] = useState({ search: '', status: '', customerType: '', startDate: '', endDate: '' })
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ invoices: [], pagination: { total: 0, totalPages: 0 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const detailRequest = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      const response = await getInvoices({ ...filters, page, limit: 20 }, controller.signal)
      if (controller.signal.aborted) return
      if (response.ok && response.data?.success) setResult(response.data.data)
      else {
        setResult({ invoices: [], pagination: { total: 0, totalPages: 0 } })
        setError(errorMessage(response))
      }
      setLoading(false)
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [filters, page, retry])
  useEffect(() => () => detailRequest.current?.abort(), [])

  function updateFilter(key, value) {
    setLoading(true)
    setFilters(current => ({ ...current, [key]: value }))
    setPage(1)
  }
  async function openInvoice(id, mode) {
    detailRequest.current?.abort()
    const controller = new AbortController()
    detailRequest.current = controller
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    const response = await getInvoiceById(id, controller.signal)
    if (controller.signal.aborted) return
    if (response.ok && response.data?.success) setDetail({ invoice: response.data.data.invoice, mode })
    else setDetailError(errorMessage(response))
    setDetailLoading(false)
  }

  return (
    <div className="products-page invoices-page">
      <header className="products-page__header invoices-page__header">
        <div><span className="section-label">Billing & Receivables</span><h2>Invoices</h2><p>View issued invoices and their recorded payment details.</p></div>
        <Button variant="secondary" onClick={() => { setLoading(true); setRetry(n => n + 1) }}>Refresh</Button>
      </header>
      <Card className="products-toolbar-card invoices-toolbar-card">
        <div className="products-toolbar invoices-toolbar">
          <input aria-label="Search invoices" placeholder="Invoice number, customer name or code" value={filters.search} onChange={e => updateFilter('search', e.target.value)} />
          <select aria-label="Invoice status" value={filters.status} onChange={e => updateFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {['Paid', 'Pending', 'Overdue', 'Cancelled', 'Refunded'].map(s => <option key={s}>{s}</option>)}
          </select>
          <select aria-label="Customer type" value={filters.customerType} onChange={e => updateFilter('customerType', e.target.value)}>
            <option value="">All customer types</option><option>Individual</option><option>Business</option>
          </select>
          <label>From (UTC)<input type="date" value={filters.startDate} onChange={e => updateFilter('startDate', e.target.value)} /></label>
          <label>To (UTC)<input type="date" value={filters.endDate} onChange={e => updateFilter('endDate', e.target.value)} /></label>
        </div>
      </Card>
      {error && <p role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
      {detailError && <p role="alert">{detailError}</p>}
      {detailLoading && <p role="status">Loading invoice details…</p>}
      <Card className="products-table-card invoices-table-card">
        <div className="products-table-wrap">
          <table className="products-table invoices-table">
            <thead><tr>{['Invoice', 'Order', 'Customer', 'Invoice Date', 'Due Date', 'Amount', 'Payment', 'Status', 'Actions'].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="9" role="status">Loading invoices…</td></tr> : error ? null : result.invoices.length === 0 ? (
                <tr><td colSpan="9"><div className="inventory-empty-state"><strong>No invoices found</strong><span>No issued invoices match these filters.</span></div></td></tr>
              ) : result.invoices.map(invoice => (
                <tr key={invoice.id}>
                  <td>{invoice.invoiceNumber}</td><td>{invoice.orderNumber}</td><td>{invoice.customerName}</td>
                  <td>{date(invoice.invoiceDate)}</td><td>{date(invoice.dueDate)}</td><td>{money(invoice.total, invoice.currencyCode)}</td>
                  <td>{invoice.paymentMethod}</td><td><Badge tone={invoice.status === 'Paid' ? 'success' : 'warning'}>{invoice.status}</Badge></td>
                  <td><div className="invoice-actions"><button disabled={detailLoading} onClick={() => openInvoice(invoice.id, 'details')}>View</button><button disabled={detailLoading} onClick={() => openInvoice(invoice.id, 'preview')}>Preview</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!error && <div className="products-page__actions">
          <Button disabled={loading || page === 1} onClick={() => { setLoading(true); setPage(n => n - 1) }}>Previous</Button>
          <span>{loading ? 'Loading…' : `${result.pagination.total} invoices · Page ${page} of ${Math.max(1, result.pagination.totalPages)}`}</span>
          <Button disabled={loading || page >= result.pagination.totalPages} onClick={() => { setLoading(true); setPage(n => n + 1) }}>Next</Button>
        </div>}
      </Card>
      <InvoiceDetailsModal invoice={detail?.mode === 'details' ? detail.invoice : null} onClose={() => setDetail(null)} />
      <InvoicePreviewModal invoice={detail?.mode === 'preview' ? detail.invoice : null} onClose={() => setDetail(null)} />
    </div>
  )
}

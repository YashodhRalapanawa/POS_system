import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import ReturnDetailsModal from './ReturnDetailsModal'
import NewReturnModal from './NewReturnModal'
import { initialReturns, returnStatusOptions, refundMethodOptions, returnReasonOptions, returnDateOptions } from '../data/mockReturns'
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

function ReturnsPage() {
  const navigate = useNavigate()
  const [returns, setReturns] = useState(initialReturns)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [refundMethodFilter, setRefundMethodFilter] = useState('All Refund Methods')
  const [reasonFilter, setReasonFilter] = useState('All Reasons')
  const [dateFilter, setDateFilter] = useState('All Dates')
  const [selectedReturnId, setSelectedReturnId] = useState(null)
  const [moreReturnId, setMoreReturnId] = useState(null)
  const [isNewReturnOpen, setIsNewReturnOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const filteredReturns = useMemo(() => {
    return returns.filter((entry) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [entry.id, entry.orderId, entry.customerName].join(' ').toLowerCase().includes(searchText)

      const matchesStatus = statusFilter === 'All Status' || entry.status === statusFilter
      const matchesRefundMethod = refundMethodFilter === 'All Refund Methods' || entry.refundMethod === refundMethodFilter
      const matchesReason = reasonFilter === 'All Reasons' || entry.reason === reasonFilter

      const returnDate = new Date(entry.createdAt)
      const today = new Date()
      const diffDays = (today.getTime() - returnDate.getTime()) / (1000 * 60 * 60 * 24)

      let matchesDate = true
      if (dateFilter === 'Today') {
        matchesDate = returnDate.toDateString() === today.toDateString()
      } else if (dateFilter === 'Last 7 Days') {
        matchesDate = diffDays <= 7 && diffDays >= 0
      } else if (dateFilter === 'Last 30 Days') {
        matchesDate = diffDays <= 30 && diffDays >= 0
      }

      return matchesSearch && matchesStatus && matchesRefundMethod && matchesReason && matchesDate
    })
  }, [returns, search, statusFilter, refundMethodFilter, reasonFilter, dateFilter])

  const totalReturns = returns.length
  const pendingReturns = returns.filter((entry) => entry.status === 'Pending').length
  const completedReturns = returns.filter((entry) => entry.status === 'Completed').length
  const totalRefundValue = returns.reduce((total, entry) => total + Number(entry.refundAmount), 0)

  const getStatusTone = (status) => {
    if (status === 'Completed') return 'success'
    if (status === 'Pending' || status === 'Approved') return 'warning'
    if (status === 'Rejected') return 'danger'
    return 'warning'
  }

  const selectedReturn = returns.find((entry) => entry.id === selectedReturnId) ?? null
  const moreReturn = returns.find((entry) => entry.id === moreReturnId) ?? null

  const handleCreateReturn = (newEntry) => {
    const returnId = `RET-${new Date().getFullYear()}-${String(returns.length + 1).padStart(3, '0')}`
    const entry = {
      ...newEntry,
      id: returnId,
      status: 'Pending',
    }

    setReturns((currentReturns) => [entry, ...currentReturns])
    setSuccessMessage(`Return ${returnId} created successfully.`)
    setIsNewReturnOpen(false)
  }

  const handleApproveReturn = (returnId) => {
    setReturns((currentReturns) =>
      currentReturns.map((entry) => (entry.id === returnId && entry.status === 'Pending' ? { ...entry, status: 'Approved' } : entry)),
    )
    setMoreReturnId(null)
  }

  const handleRejectReturn = (returnId) => {
    setReturns((currentReturns) =>
      currentReturns.map((entry) => (entry.id === returnId && entry.status === 'Pending' ? { ...entry, status: 'Rejected' } : entry)),
    )
    setMoreReturnId(null)
  }

  const handleProcessReturn = (returnId) => {
    setReturns((currentReturns) =>
      currentReturns.map((entry) => (entry.id === returnId && entry.status === 'Approved' ? { ...entry, status: 'Completed' } : entry)),
    )
    setMoreReturnId(null)
  }

  const handleCopyReturnId = async (returnId) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(returnId)
    }
    setMoreReturnId(null)
  }

  return (
    <div className="products-page returns-page">
      <header className="products-page__header returns-page__header">
        <div>
          <span className="section-label">Return Management</span>
          <h2>Returns</h2>
          <p>Manage product returns, refunds, and inventory adjustments from completed sales.</p>
        </div>

        <div className="products-page__actions">
          <Button variant="primary" type="button" onClick={() => setIsNewReturnOpen(true)}>+ New Return</Button>
        </div>
      </header>

      <section className="products-kpis returns-kpis">
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Returns</span>
          <strong className="kpi-card__value small">{totalReturns}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Pending Returns</span>
          <strong className="kpi-card__value small">{pendingReturns}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Completed Returns</span>
          <strong className="kpi-card__value small">{completedReturns}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Refund Value</span>
          <strong className="kpi-card__value small">{formatCurrency(totalRefundValue)}</strong>
        </Card>
      </section>

      <Card className="products-toolbar-card returns-toolbar-card">
        <div className="products-toolbar returns-toolbar">
          <div className="products-toolbar__search">
            <input
              type="text"
              placeholder="Search return ID, order ID, customer..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {returnStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <select value={refundMethodFilter} onChange={(event) => setRefundMethodFilter(event.target.value)}>
            {refundMethodOptions.map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>

          <select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)}>
            {returnReasonOptions.map((reason) => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>

          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
            {returnDateOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="products-table-card returns-table-card">
        <div className="products-table-wrap">
          <table className="products-table returns-table">
            <thead>
              <tr>
                <th>Return ID</th>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Returned Items</th>
                <th>Refund Amount</th>
                <th>Refund Method</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan="10">
                    <div className="inventory-empty-state">
                      <strong>No returns found</strong>
                      <span>Try adjusting your search or filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReturns.map((entry) => {
                  const returnedQuantity = entry.items.reduce((total, item) => total + Number(item.quantity || 0), 0)

                  return (
                    <tr key={entry.id}>
                      <td className="return-id-cell">{entry.id}</td>
                      <td className="return-order-cell">{entry.orderId}</td>
                      <td>
                        <div className="customer-cell">
                          <div className="product-cell__dot" aria-hidden="true" />
                          <div>
                            <div className="customer-cell__name">{entry.customerName}</div>
                            <div className="customer-cell__meta">{entry.customerCode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="return-items-cell">{returnedQuantity}</td>
                      <td className="return-amount-cell">{formatCurrency(entry.refundAmount)}</td>
                      <td className="return-method-cell">{entry.refundMethod}</td>
                      <td className="return-reason-cell">{entry.reason}</td>
                      <td className="return-status-cell">
                        <Badge tone={getStatusTone(entry.status)}>{entry.status}</Badge>
                      </td>
                      <td className="return-date-cell">{formatDate(entry.createdAt)}</td>
                      <td>
                        <div className="return-actions">
                          <button type="button" onClick={() => setSelectedReturnId(entry.id)}>View</button>
                          <button type="button" onClick={() => setMoreReturnId(entry.id)}>More</button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {successMessage && (
        <div className="modal-backdrop" onClick={() => setSuccessMessage('')}>
          <div className="confirmation-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Return Created</h3>
            <p>{successMessage}</p>
            <div className="confirmation-modal__actions">
              <Button variant="primary" type="button" onClick={() => setSuccessMessage('')}>Close</Button>
            </div>
          </div>
        </div>
      )}

      <ReturnDetailsModal returnEntry={selectedReturn} onClose={() => setSelectedReturnId(null)} />

      <NewReturnModal
        isOpen={isNewReturnOpen}
        onClose={() => setIsNewReturnOpen(false)}
        onCreate={handleCreateReturn}
      />

      {moreReturn && (
        <div className="modal-backdrop" onClick={() => setMoreReturnId(null)}>
          <div className="confirmation-modal return-more-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{moreReturn.id}</h3>
            <div className="order-more-menu">
              <button type="button" onClick={() => { setSelectedReturnId(moreReturn.id); setMoreReturnId(null) }}>View Return</button>
              {moreReturn.status === 'Pending' && (
                <>
                  <button type="button" onClick={() => handleApproveReturn(moreReturn.id)}>Approve Return</button>
                  <button type="button" onClick={() => handleRejectReturn(moreReturn.id)}>Reject Return</button>
                </>
              )}
              {moreReturn.status === 'Approved' && (
                <button type="button" onClick={() => handleProcessReturn(moreReturn.id)}>Process Return</button>
              )}
              <button type="button" onClick={() => { void handleCopyReturnId(moreReturn.id) }}>Copy Return ID</button>
            </div>
            <div className="confirmation-modal__actions">
              <Button variant="secondary" type="button" onClick={() => setMoreReturnId(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReturnsPage

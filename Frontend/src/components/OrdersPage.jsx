import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import OrderDetailsModal from './OrderDetailsModal'
import { getPosOrders, cancelPosOrder, completePosOrder } from '../services/api'
import { PERMISSIONS, usePermission } from '../auth/permissions'
import { paths } from '../routes'

import { useCurrency } from '../context/CurrencyContext'

const orderStatusOptions = ['All Status', 'draft', 'completed', 'cancelled']
const dateFilterOptions = ['All Dates', 'Today', 'Last 7 Days', 'Last 30 Days']

function formatDate(value) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function OrdersPage() {
  const navigate = useNavigate()
  const { formatCurrency } = useCurrency()
  const canView = usePermission(PERMISSIONS.POS_ORDERS_VIEW) || usePermission(PERMISSIONS.ORDERS_VIEW)
  const canUpdate = usePermission(PERMISSIONS.POS_ORDERS_UPDATE)
  const canCancel = usePermission(PERMISSIONS.POS_ORDERS_CANCEL)
  const canComplete = usePermission(PERMISSIONS.POS_ORDERS_COMPLETE) || usePermission(PERMISSIONS.POS_USE)
  const canUsePos = usePermission(PERMISSIONS.POS_USE)

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [notification, setNotification] = useState(null)

  // Filters & Pagination
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [dateFilter, setDateFilter] = useState('All Dates')
  const [page, setPage] = useState(1)
  const [limit] = useState(15)
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 })

  // Modal states
  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [orderToCancel, setOrderToCancel] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelModalError, setCancelModalError] = useState(null)
  const [orderToComplete, setOrderToComplete] = useState(null)
  const [isCompleting, setIsCompleting] = useState(false)
  const [completeModalError, setCompleteModalError] = useState(null)

  const showNotification = (message, tone = 'success') => {
    setNotification({ message, tone })
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr))
    }, 4000)
  }

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)

    try {
      const params = {
        page,
        limit,
      }

      if (search.trim()) params.search = search.trim()
      if (statusFilter && statusFilter !== 'All Status') params.status = statusFilter
      if (dateFilter && dateFilter !== 'All Dates') params.dateFilter = dateFilter

      const res = await getPosOrders(params)

      if (res.ok && res.data?.success) {
        const orderList = res.data.data?.orders || []
        setOrders(orderList)
        if (res.data.data?.pagination) {
          setPagination(res.data.data.pagination)
        } else {
          setPagination({ page, limit, total: orderList.length, totalPages: 1 })
        }
      } else {
        const msg = res.data?.message || res.error || 'Failed to retrieve orders.'
        setErrorMessage(msg)
        setOrders([])
      }
    } catch (err) {
      setErrorMessage(err.message || 'Error communicating with server.')
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, statusFilter, dateFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setPage(1)
    fetchOrders()
  }

  const handleCancelClick = (order) => {
    setOrderToCancel(order)
    setCancelReason('')
    setCancelModalError(null)
  }

  const handleConfirmCancel = async () => {
    if (!orderToCancel?.id) return
    setIsCancelling(true)
    setCancelModalError(null)

    try {
      const res = await cancelPosOrder(orderToCancel.id, { reason: cancelReason.trim() })
      if (res.ok && res.data?.success) {
        showNotification(`Draft order ${orderToCancel.orderNumber} was cancelled successfully.`)
        setOrderToCancel(null)
        fetchOrders()
      } else {
        setCancelModalError(res.data?.message || res.error || 'Failed to cancel order.')
      }
    } catch (err) {
      setCancelModalError(err.message || 'Error communicating with server.')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleConfirmComplete = async () => {
    if (!orderToComplete?.id) return
    setIsCompleting(true)
    setCompleteModalError(null)

    try {
      const res = await completePosOrder(orderToComplete.id)
      if (res.ok && res.data?.success) {
        showNotification(`Order ${orderToComplete.orderNumber} completed successfully! Stock deducted.`)
        setOrderToComplete(null)
        fetchOrders()
      } else {
        setCompleteModalError(res.data?.message || res.error || 'Failed to complete order.')
      }
    } catch (err) {
      setCompleteModalError(err.message || 'Error communicating with server.')
    } finally {
      setIsCompleting(false)
    }
  }

  const handleOrderUpdatedInModal = (updatedId, newStatus) => {
    setOrders((current) =>
      current.map((ord) => (ord.id === updatedId ? { ...ord, status: newStatus } : ord))
    )
    showNotification(`Order status updated to ${newStatus}.`)
    fetchOrders()
  }

  const getStatusTone = (status) => {
    const s = String(status || '').toLowerCase()
    if (s === 'completed') return 'success'
    if (s === 'cancelled') return 'danger'
    if (s === 'draft') return 'warning'
    return 'info'
  }

  // KPIs
  const totalOrdersCount = pagination.total || orders.length
  const draftOrdersCount = orders.filter((o) => String(o.status).toLowerCase() === 'draft').length
  const completedOrdersCount = orders.filter((o) => String(o.status).toLowerCase() === 'completed').length
  const cancelledOrdersCount = orders.filter((o) => String(o.status).toLowerCase() === 'cancelled').length
  const draftValueTotal = orders
    .filter((o) => String(o.status).toLowerCase() === 'draft')
    .reduce((sum, o) => sum + (o.totalAmount || o.total || 0), 0)

  return (
    <div className="products-page orders-page">
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            backgroundColor: notification.tone === 'danger' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(34, 197, 94, 0.95)',
            color: '#fff',
            fontWeight: 500,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease-in-out',
          }}
        >
          <span>{notification.tone === 'danger' ? '⚠️' : '✓'}</span>
          <span>{notification.message}</span>
        </div>
      )}

      <header className="products-page__header orders-page__header">
        <div>
          <h2>POS Orders</h2>
          <p>Review draft POS orders, monitor cashier transactions, and edit or cancel saved carts.</p>
        </div>

        <div className="products-page__actions">
          <Button variant="secondary" type="button" onClick={() => fetchOrders()}>
            Refresh
          </Button>
          {canUsePos && (
            <Button variant="primary" type="button" onClick={() => navigate(paths.pos)}>
              + New Sale
            </Button>
          )}
        </div>
      </header>

      {/* KPI Stats */}
      <section className="products-kpis orders-kpis">
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Orders</span>
          <strong className="kpi-card__value small">{totalOrdersCount}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Draft Orders</span>
          <strong className="kpi-card__value small">{draftOrdersCount}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Completed Orders</span>
          <strong className="kpi-card__value small" style={{ color: '#10b981' }}>{completedOrdersCount}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Cancelled Orders</span>
          <strong className="kpi-card__value small">{cancelledOrdersCount}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Draft Value</span>
          <strong className="kpi-card__value small">{formatCurrency(draftValueTotal)}</strong>
        </Card>
      </section>

      {/* Toolbar / Filters */}
      <Card className="products-toolbar-card orders-toolbar-card">
        <form onSubmit={handleSearchSubmit} className="products-toolbar orders-toolbar">
          <div className="products-toolbar__search">
            <input
              type="text"
              placeholder="Search order number or notes (Press Enter)..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value)
              setPage(1)
            }}
          >
            {orderStatusOptions.map((status) => (
              <option key={status} value={status}>
                {status === 'All Status' ? 'All Status' : status.toUpperCase()}
              </option>
            ))}
          </select>

          <select
            value={dateFilter}
            onChange={(event) => {
              setDateFilter(event.target.value)
              setPage(1)
            }}
          >
            {dateFilterOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <Button variant="secondary" type="submit" style={{ whiteSpace: 'nowrap' }}>
            Search
          </Button>
        </form>
      </Card>

      {/* Error Message */}
      {errorMessage && (
        <div style={{
          padding: '12px 16px',
          marginBottom: '1rem',
          borderRadius: '8px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          color: '#ef4444',
          fontSize: '14px',
        }}>
          {errorMessage}
        </div>
      )}

      {/* Orders Table */}
      <Card className="products-table-card orders-table-card">
        <div className="products-table-wrap">
          <table className="products-table orders-table">
            <thead>
              <tr>
                <th>Order Number</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Cashier</th>
                <th>Store</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '2.5rem' }}>
                    <div style={{ color: 'var(--color-muted, #718096)' }}>Loading orders from Supabase...</div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <div className="inventory-empty-state" style={{ padding: '2.5rem', textAlign: 'center' }}>
                      <strong>No POS orders found</strong>
                      <span style={{ display: 'block', marginTop: '4px', color: 'var(--color-muted, #718096)' }}>
                        Save a cart as a draft order in the POS screen to see it here.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isDraft = String(order.status).toLowerCase() === 'draft'

                  return (
                    <tr key={order.id}>
                      <td className="order-id-cell">
                        <strong>{order.orderNumber || order.id}</strong>
                      </td>
                      <td className="order-date-cell">
                        <div>{formatDate(order.createdAt)}</div>
                        {order.completedAt && (
                          <small style={{ display: 'block', color: '#10b981', fontSize: '11px', marginTop: '2px' }}>
                            Completed {formatDate(order.completedAt)}
                          </small>
                        )}
                      </td>
                      <td className="customer-name-cell">
                        <div>
                          <span>{order.customerName || order.customer?.name || 'Walk-in Customer'}</span>
                          {order.isWalkIn && (
                            <small style={{ display: 'block', color: 'var(--color-primary, #3182ce)' }}>
                              Walk-in
                            </small>
                          )}
                        </div>
                      </td>
                      <td>{order.cashierName || order.cashier?.name || 'Cashier'}</td>
                      <td>{order.storeName || order.store?.name || 'Main Store'}</td>
                      <td className="order-items-cell">{order.itemCount ?? (order.items?.length || 0)}</td>
                      <td className="order-amount-cell">
                        <strong>{formatCurrency(order.totalAmount ?? order.total, order.currencyCode || order.currency)}</strong>
                      </td>
                      <td className="order-status-cell">
                        <Badge tone={getStatusTone(order.status)}>
                          {String(order.status || 'draft').toUpperCase()}
                        </Badge>
                      </td>
                      <td>
                        <div className="product-row-actions order-row-actions" style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedOrderId(order.id)}
                            title="View order details"
                          >
                            View
                          </button>

                          {isDraft && canComplete && (
                            <button
                              type="button"
                              onClick={() => {
                                setOrderToComplete(order)
                                setCompleteModalError(null)
                              }}
                              title="Complete draft order and deduct stock"
                              style={{ color: '#10b981', fontWeight: 600 }}
                            >
                              Complete
                            </button>
                          )}

                          {isDraft && canUpdate && (
                            <button
                              type="button"
                              onClick={() => navigate(`${paths.pos}?orderId=${encodeURIComponent(order.id)}`)}
                              title="Continue editing draft in POS"
                              style={{ color: 'var(--color-primary, #3182ce)', fontWeight: 600 }}
                            >
                              Edit
                            </button>
                          )}

                          {isDraft && canCancel && (
                            <button
                              type="button"
                              onClick={() => handleCancelClick(order)}
                              title="Cancel draft order"
                              style={{ color: '#ef4444' }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {pagination.totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            borderTop: '1px solid var(--color-border, #e2e8f0)',
          }}>
            <span style={{ fontSize: '13px', color: 'var(--color-muted, #718096)' }}>
              Showing Page {pagination.page} of {pagination.totalPages} ({pagination.total} orders)
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="secondary"
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                type="button"
                disabled={page >= pagination.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Order Details Modal */}
      {selectedOrderId && (
        <OrderDetailsModal
          orderId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onOrderUpdated={handleOrderUpdatedInModal}
        />
      )}

      {/* Cancel Confirmation Modal */}
      {orderToCancel && (
        <div className="modal-backdrop" onClick={() => setOrderToCancel(null)}>
          <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h3>Cancel Draft Order</h3>
              <button type="button" className="modal__close" onClick={() => setOrderToCancel(null)}>×</button>
            </div>

            <div className="modal__body" style={{ padding: '1rem 0' }}>
              <p>
                Are you sure you want to cancel draft order <strong>{orderToCancel.orderNumber}</strong>?
              </p>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-muted, #718096)', marginTop: '0.5rem' }}>
                Total: <strong>{formatCurrency(orderToCancel.totalAmount ?? orderToCancel.total, orderToCancel.currencyCode || orderToCancel.currency)}</strong>
              </p>

              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.35rem' }}>
                  Cancellation Reason (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Customer cancelled, changed mind..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #cbd5e0',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              {cancelModalError && (
                <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                  {cancelModalError}
                </div>
              )}
            </div>

            <div className="confirmation-modal__actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                type="button"
                onClick={() => setOrderToCancel(null)}
                disabled={isCancelling}
              >
                Keep Order
              </Button>
              <Button
                variant="danger"
                type="button"
                onClick={handleConfirmCancel}
                disabled={isCancelling}
                style={{ backgroundColor: '#ef4444', color: '#fff', borderColor: '#ef4444' }}
              >
                {isCancelling ? 'Cancelling...' : 'Confirm Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Complete Order Confirmation Modal (Step 13) */}
      {orderToComplete && (
        <div className="modal-backdrop" onClick={() => !isCompleting && setOrderToComplete(null)}>
          <div className="modal" style={{ maxWidth: '480px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div>
                <span className="section-label">Order Completion</span>
                <h3>Confirm POS Order Completion</h3>
              </div>
              <button
                type="button"
                className="modal__close"
                onClick={() => !isCompleting && setOrderToComplete(null)}
                disabled={isCompleting}
              >
                ×
              </button>
            </div>

            <div className="modal__body" style={{ padding: '1.25rem 1.5rem' }}>
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#065f46',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>📦</span>
                <span>Complete this POS order? Stock quantities will be deducted from the selected store.</span>
              </div>

              <div className="modal__row">
                <span>Order Number</span>
                <strong>#{orderToComplete.orderNumber || orderToComplete.id}</strong>
              </div>

              <div className="modal__row">
                <span>Store</span>
                <strong>{orderToComplete.storeName || orderToComplete.store?.name || 'Main Store'}</strong>
              </div>

              <div className="modal__row">
                <span>Customer</span>
                <strong>
                  {orderToComplete.customerName || orderToComplete.customer?.name || 'Walk-in Customer'}
                  {orderToComplete.isWalkIn ? ' [Walk-in]' : ''}
                </strong>
              </div>

              <div className="modal__row">
                <span>Total Items</span>
                <strong>{orderToComplete.itemCount ?? (orderToComplete.items?.length || 0)} item(s)</strong>
              </div>

              <div className="modal__row modal__row--total" style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '2px solid var(--color-border, #e2e8f0)' }}>
                <span>Order Total</span>
                <strong style={{ fontSize: '1.25rem', color: 'var(--color-primary, #3182ce)' }}>
                  {formatCurrency(orderToComplete.totalAmount ?? orderToComplete.total, orderToComplete.currencyCode || orderToComplete.currency)}
                </strong>
              </div>

              {completeModalError && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#dc2626',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                  }}
                >
                  ⚠️ {completeModalError}
                </div>
              )}
            </div>

            <div className="modal__actions" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setOrderToComplete(null)
                  setCompleteModalError(null)
                }}
                disabled={isCompleting}
              >
                Back
              </Button>
              <Button
                variant="success"
                type="button"
                onClick={handleConfirmComplete}
                disabled={isCompleting}
                style={{
                  backgroundColor: '#10b981',
                  borderColor: '#10b981',
                  color: '#fff',
                  fontWeight: 600,
                  padding: '0.6rem 1.2rem',
                }}
              >
                {isCompleting ? 'Completing Order...' : 'Confirm & Complete Order'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrdersPage

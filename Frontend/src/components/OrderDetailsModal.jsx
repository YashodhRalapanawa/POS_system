import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Badge from './ui/Badge'
import Button from './ui/Button'
import { getPosOrderById, cancelPosOrder, completePosOrder } from '../services/api'
import { PERMISSIONS, usePermission } from '../auth/permissions'
import { paths } from '../routes'
import { useCurrency } from '../context/CurrencyContext'

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

function OrderDetailsModal({ order: initialOrder, orderId, onClose, onOrderUpdated }) {
  const navigate = useNavigate()
  const { formatCurrency } = useCurrency()
  const canUpdate = usePermission(PERMISSIONS.POS_ORDERS_UPDATE)
  const canCancel = usePermission(PERMISSIONS.POS_ORDERS_CANCEL)
  const canComplete = usePermission(PERMISSIONS.POS_ORDERS_COMPLETE) || usePermission(PERMISSIONS.POS_USE)

  const effectiveId = orderId || initialOrder?.id
  const [order, setOrder] = useState(initialOrder || null)
  const orderCurrency = order?.currencyCode || order?.currency
  const formatOrderMoney = (val) => formatCurrency(val, orderCurrency)
  const [loading, setLoading] = useState(!initialOrder && Boolean(effectiveId))
  const [error, setError] = useState(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState(null)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [completeError, setCompleteError] = useState(null)

  useEffect(() => {
    if (!effectiveId) return

    let isMounted = true
    setLoading(true)
    setError(null)

    getPosOrderById(effectiveId)
      .then((res) => {
        if (!isMounted) return
        if (res.ok && res.data?.success) {
          setOrder(res.data.data?.order || res.data.data)
        } else {
          // If fallback provided in initialOrder, use it
          if (initialOrder) {
            setOrder(initialOrder)
          } else {
            setError(res.data?.message || res.error || 'Failed to load order details.')
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return
        if (initialOrder) {
          setOrder(initialOrder)
        } else {
          setError(err.message || 'Error connecting to server.')
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [effectiveId, initialOrder])

  if (!effectiveId && !order) return null

  const isDraft = String(order?.status || '').toLowerCase() === 'draft'
  const isCancelled = String(order?.status || '').toLowerCase() === 'cancelled'

  const handleEditDraft = () => {
    if (!order?.id) return
    onClose()
    navigate(`${paths.pos}?orderId=${encodeURIComponent(order.id)}`)
  }

  const handleConfirmCancel = async () => {
    if (!order?.id) return
    setIsCancelling(true)
    setCancelError(null)

    try {
      const res = await cancelPosOrder(order.id, { reason: cancelReason.trim() })
      if (res.ok && res.data?.success) {
        setShowCancelConfirm(false)
        setOrder((prev) => (prev ? { ...prev, status: 'cancelled' } : prev))
        if (typeof onOrderUpdated === 'function') {
          onOrderUpdated(order.id, 'cancelled')
        }
      } else {
        setCancelError(res.data?.message || res.error || 'Failed to cancel order.')
      }
    } catch (err) {
      setCancelError(err.message || 'Error communicating with server.')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleConfirmComplete = async () => {
    if (!order?.id) return
    setIsCompleting(true)
    setCompleteError(null)

    try {
      const res = await completePosOrder(order.id)
      if (res.ok && res.data?.success) {
        const completed = res.data.data?.order || res.data.data
        setShowCompleteConfirm(false)
        setOrder((prev) => (prev ? {
          ...prev,
          status: 'completed',
          completedAt: completed?.completedAt || new Date().toISOString(),
          completedBy: completed?.completedBy || null,
        } : prev))
        if (typeof onOrderUpdated === 'function') {
          onOrderUpdated(order.id, 'completed')
        }
      } else {
        setCompleteError(res.data?.message || res.error || 'Failed to complete order.')
      }
    } catch (err) {
      setCompleteError(err.message || 'Error communicating with server.')
    } finally {
      setIsCompleting(false)
    }
  }

  const getStatusTone = (status) => {
    const s = String(status || '').toLowerCase()
    if (s === 'completed') return 'success'
    if (s === 'cancelled') return 'danger'
    if (s === 'draft') return 'warning'
    return 'info'
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal order-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Order Details</span>
            <h3>{order?.orderNumber || order?.id || 'Loading...'}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="modal__body" style={{ textAlign: 'center', padding: '2rem' }}>
            <span>Loading order information from Supabase...</span>
          </div>
        ) : error ? (
          <div className="modal__body" style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>
            <span>{error}</span>
          </div>
        ) : order ? (
          <>
            <div className="modal__body">
              <div className="modal__row">
                <span>Order Number</span>
                <strong>{order.orderNumber || order.id}</strong>
              </div>

              <div className="modal__row">
                <span>Customer</span>
                <strong>
                  {order.customerName || order.customer?.name || 'Walk-in Customer'}
                  {order.isWalkIn ? ' [Walk-in]' : ''}
                </strong>
              </div>

              {order.customerPhone && (
                <div className="modal__row">
                  <span>Customer Phone</span>
                  <strong>{order.customerPhone}</strong>
                </div>
              )}

              <div className="modal__row">
                <span>Cashier</span>
                <strong>{order.cashierName || order.cashier?.name || 'Cashier'}</strong>
              </div>

              <div className="modal__row">
                <span>Store</span>
                <strong>{order.storeName || order.store?.name || 'Main Store'}</strong>
              </div>

              <div className="modal__row">
                <span>Created Date</span>
                <strong>{formatDate(order.createdAt)}</strong>
              </div>

              {order.completedAt && (
                <div className="modal__row">
                  <span>Completion Date</span>
                  <strong style={{ color: '#10b981' }}>{formatDate(order.completedAt)}</strong>
                </div>
              )}

              <div className="modal__row">
                <span>Status</span>
                <strong>
                  <Badge tone={getStatusTone(order.status)}>
                    {String(order.status || 'draft').toUpperCase()}
                  </Badge>
                </strong>
              </div>

              {order.notes && (
                <div className="modal__row">
                  <span>Notes</span>
                  <small style={{ maxWidth: '60%', textAlign: 'right' }}>{order.notes}</small>
                </div>
              )}

              <div className="modal__row modal__row--total">
                <span>Order Summary</span>
                <strong>{formatOrderMoney(order.totalAmount ?? order.total)}</strong>
              </div>

              <div className="modal__row">
                <span>Subtotal</span>
                <strong>{formatOrderMoney(order.subtotal)}</strong>
              </div>

              <div className="modal__row modal__row--total">
                <span>Total Amount</span>
                <strong>{formatOrderMoney(order.totalAmount ?? order.total)}</strong>
              </div>
            </div>

            <div className="order-items-summary">
              <h4>Items ({order.items?.length || 0})</h4>
              <div className="order-items-summary__header order-items-summary__row">
                <span>Item</span>
                <span>Qty</span>
                <span>Unit Price</span>
                <span>Line Total</span>
              </div>

              {Array.isArray(order.items) && order.items.length > 0 ? (
                order.items.map((item, idx) => (
                  <div key={item.id || `${order.id}-${idx}`} className="order-items-summary__row">
                    <span>
                      <strong>{item.productName || item.name}</strong>
                      {item.sku ? <small style={{ display: 'block', color: 'var(--color-muted, #718096)' }}>{item.sku}</small> : null}
                    </span>
                    <span>{item.quantity}</span>
                    <span>{formatOrderMoney(item.unitPrice)}</span>
                    <span>{formatOrderMoney(item.lineSubtotal ?? item.lineTotal)}</span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '0.75rem', textAlign: 'center', color: '#a0aec0' }}>
                  No items recorded on this order.
                </div>
              )}
            </div>

            {showCancelConfirm && (
              <div style={{
                margin: '1rem',
                padding: '1rem',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
              }}>
                <strong style={{ color: '#ef4444', display: 'block', marginBottom: '0.5rem' }}>
                  Confirm Draft Order Cancellation
                </strong>
                <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                  Are you sure you want to cancel draft order <strong>{order.orderNumber}</strong>? This action cannot be undone.
                </p>
                <div style={{ marginBottom: '0.75rem' }}>
                  <input
                    type="text"
                    placeholder="Optional cancellation reason..."
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #cbd5e0',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                    }}
                  />
                </div>
                {cancelError && (
                  <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    {cancelError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      setShowCancelConfirm(false)
                      setCancelError(null)
                    }}
                    disabled={isCancelling}
                  >
                    Back
                  </Button>
                  <Button
                    variant="danger"
                    type="button"
                    onClick={handleConfirmCancel}
                    disabled={isCancelling}
                    style={{ backgroundColor: '#ef4444', color: '#fff', borderColor: '#ef4444' }}
                  >
                    {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                  </Button>
                </div>
              </div>
            )}

            {showCompleteConfirm && (
              <div style={{
                margin: '1rem',
                padding: '1rem',
                border: '1px solid #10b981',
                borderRadius: '8px',
                backgroundColor: 'rgba(16, 185, 129, 0.06)',
              }}>
                <strong style={{ color: '#065f46', display: 'block', marginBottom: '0.5rem' }}>
                  Confirm POS Order Completion
                </strong>
                <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem', color: '#047857' }}>
                  Complete this POS order? Stock quantities will be deducted from the selected store.
                </p>
                <div style={{ fontSize: '13px', marginBottom: '0.75rem' }}>
                  <div>Order Number: <strong>{order.orderNumber}</strong></div>
                  <div>Store: <strong>{order.storeName || order.store?.name || 'Main Store'}</strong></div>
                  <div>Customer: <strong>{order.customerName || order.customer?.name || 'Walk-in Customer'}</strong></div>
                  <div>Total Items: <strong>{order.items?.length || 0} line(s)</strong></div>
                  <div>Total Quantity: <strong>{order.items?.reduce((s, it) => s + Number(it.quantity || 1), 0) || 0} units</strong></div>
                  <div>Order Total: <strong>{formatOrderMoney(order.totalAmount ?? order.total)}</strong></div>
                </div>
                {completeError && (
                  <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    ⚠️ {completeError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      setShowCompleteConfirm(false)
                      setCompleteError(null)
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
                    style={{ backgroundColor: '#10b981', color: '#fff', borderColor: '#10b981', fontWeight: 600 }}
                  >
                    {isCompleting ? 'Completing...' : 'Confirm & Complete'}
                  </Button>
                </div>
              </div>
            )}

            <div className="modal__actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {isDraft && canComplete && !showCancelConfirm && !showCompleteConfirm && (
                  <Button
                    variant="success"
                    type="button"
                    onClick={() => setShowCompleteConfirm(true)}
                    style={{ backgroundColor: '#10b981', color: '#fff', borderColor: '#10b981', fontWeight: 600 }}
                  >
                    Complete Order
                  </Button>
                )}
                {isDraft && canUpdate && !showCancelConfirm && !showCompleteConfirm && (
                  <Button variant="secondary" type="button" onClick={handleEditDraft}>
                    Edit Draft Order
                  </Button>
                )}
                {isDraft && canCancel && !showCancelConfirm && !showCompleteConfirm && (
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setShowCancelConfirm(true)}
                    style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                  >
                    Cancel Order
                  </Button>
                )}
              </div>
              <Button variant="primary" type="button" onClick={onClose}>Close</Button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default OrderDetailsModal

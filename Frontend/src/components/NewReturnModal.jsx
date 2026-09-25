import { useEffect, useMemo, useState } from 'react'
import { initialOrders } from '../data/mockOrders'
import Button from './ui/Button'

const returnReasonOptions = ['Damaged', 'Defective', 'Wrong Item', 'Customer Changed Mind', 'Incorrect Quantity', 'Other']
const refundMethodOptions = ['Original Payment', 'Cash', 'Card', 'Store Credit']

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

function getDraftRefundSummary(selectedItems) {
  const subtotal = selectedItems.reduce((total, item) => total + Number(item.unitPrice) * Number(item.returnQty), 0)
  const tax = selectedItems.reduce((total, item) => total + ((Number(item.unitPrice) * Number(item.returnQty)) * (Number(item.taxRate || 8) / 100)), 0)
  const refundAmount = subtotal + tax

  return { subtotal, tax, refundAmount }
}

function NewReturnModal({ isOpen, onClose, onCreate }) {
  const [orderIdInput, setOrderIdInput] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [refundMethod, setRefundMethod] = useState('Original Payment')
  const [selectedItems, setSelectedItems] = useState([])
  const [validationError, setValidationError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setOrderIdInput('')
      setSelectedOrder(null)
      setReason('')
      setNotes('')
      setRefundMethod('Original Payment')
      setSelectedItems([])
      setValidationError('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleFindOrder = () => {
    const normalized = orderIdInput.trim().toUpperCase()
    if (!normalized) {
      setSelectedOrder(null)
      setValidationError('Please enter an order ID to find the original sale.')
      return
    }

    const order = initialOrders.find((entry) => entry.id.toUpperCase() === normalized)

    if (!order) {
      setSelectedOrder(null)
      setValidationError('No matching order was found in the mock POS data.')
      return
    }

    setSelectedOrder(order)
    setSelectedItems(
      order.items.map((item, index) => ({
        id: `${order.id}-${item.name}-${index}`,
        name: item.name,
        sku: `${item.name.toUpperCase().replace(/\s+/g, '-')}-SKU`,
        purchasedQty: item.quantity,
        returnQty: 0,
        unitPrice: item.unitPrice,
        taxRate: 8,
      })),
    )
    setValidationError('')
  }

  const handleItemQtyChange = (itemId, value) => {
    const numericValue = Number(value)
    const item = selectedItems.find((entry) => entry.id === itemId)
    if (!item) return

    const safeValue = Number.isNaN(numericValue) ? 0 : Math.max(0, Math.min(item.purchasedQty, numericValue))

    setSelectedItems((current) =>
      current.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              returnQty: safeValue,
            }
          : entry,
      ),
    )
  }

  const selectedReturnItems = selectedItems.filter((item) => item.returnQty > 0)
  const refundPreview = getDraftRefundSummary(selectedReturnItems)

  const handleSubmit = () => {
    if (!selectedOrder) {
      setValidationError('Select a valid original order before creating a return.')
      return
    }

    if (selectedReturnItems.length === 0) {
      setValidationError('Select at least one item to return.')
      return
    }

    if (!reason) {
      setValidationError('Please choose a return reason.')
      return
    }

    const totalReturnedQty = selectedReturnItems.reduce((total, item) => total + Number(item.returnQty || 0), 0)
    if (totalReturnedQty <= 0) {
      setValidationError('Return quantity must be greater than zero.')
      return
    }

    const invalidQty = selectedItems.some((item) => Number(item.returnQty) < 0 || Number(item.returnQty) > Number(item.purchasedQty))
    if (invalidQty) {
      setValidationError('Return quantity cannot be negative or exceed the purchased quantity.')
      return
    }

    const returnPayload = {
      orderId: selectedOrder.id,
      customerName: selectedOrder.customerName,
      customerCode: selectedOrder.customerId ? selectedOrder.customerId.toUpperCase() : 'CUS-001',
      createdAt: new Date().toISOString(),
      status: 'Pending',
      refundMethod,
      reason,
      notes,
      subtotal: refundPreview.subtotal,
      tax: refundPreview.tax,
      refundAmount: refundPreview.refundAmount,
      items: selectedReturnItems.map((item) => ({
        name: item.name,
        sku: item.sku,
        quantity: item.returnQty,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        refundAmount: Number((item.unitPrice * item.returnQty).toFixed(2)) + Number(((item.unitPrice * item.returnQty) * (item.taxRate / 100)).toFixed(2)),
      })),
    }

    onCreate(returnPayload)
    setValidationError('')
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal new-return-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Return Processing</span>
            <h3>New Return</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="new-return-form">
          <div className="new-return-section">
            <h4>Original Order</h4>
            <div className="new-return-order-lookup">
              <input
                type="text"
                value={orderIdInput}
                placeholder="Enter original order ID"
                onChange={(event) => setOrderIdInput(event.target.value)}
              />
              <Button variant="secondary" type="button" onClick={handleFindOrder}>Find Order</Button>
            </div>
          </div>

          {selectedOrder && (
            <div className="new-return-order-summary">
              <div className="modal__row">
                <span>Customer</span>
                <strong>{selectedOrder.customerName}</strong>
              </div>
              <div className="modal__row">
                <span>Order Date</span>
                <strong>{formatDate(selectedOrder.createdAt)}</strong>
              </div>
              <div className="modal__row">
                <span>Original Payment Method</span>
                <strong>{selectedOrder.paymentMethod}</strong>
              </div>
              <div className="modal__row">
                <span>Original Order Total</span>
                <strong>{formatCurrency(selectedOrder.total)}</strong>
              </div>
            </div>
          )}

          {selectedOrder && (
            <div className="new-return-section">
              <h4>Return Items</h4>
              <div className="return-item-list">
                {selectedItems.map((item) => (
                  <div key={item.id} className="return-item-row">
                    <div className="return-item-row__meta">
                      <strong>{item.name}</strong>
                      <span>{item.sku}</span>
                    </div>
                    <div className="return-item-row__qty">
                      <span>Purchased Qty: {item.purchasedQty}</span>
                      <input
                        type="number"
                        min="0"
                        max={item.purchasedQty}
                        value={item.returnQty}
                        onChange={(event) => handleItemQtyChange(item.id, event.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedOrder && (
            <div className="new-return-section">
              <h4>Return Details</h4>
              <div className="new-return-fields">
                <label>
                  <span>Return Reason</span>
                  <select value={reason} onChange={(event) => setReason(event.target.value)}>
                    <option value="">Select reason</option>
                    {returnReasonOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Refund Method</span>
                  <select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value)}>
                    {refundMethodOptions.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </label>

                <label className="new-return-notes">
                  <span>Notes (optional)</span>
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="3" placeholder="Add staff notes for this return" />
                </label>
              </div>
            </div>
          )}

          {selectedReturnItems.length > 0 && (
            <div className="new-return-section">
              <h4>Refund Calculation</h4>
              <div className="new-return-totals">
                <div className="modal__row">
                  <span>Subtotal</span>
                  <strong>{formatCurrency(refundPreview.subtotal)}</strong>
                </div>
                <div className="modal__row">
                  <span>Tax</span>
                  <strong>{formatCurrency(refundPreview.tax)}</strong>
                </div>
                <div className="modal__row modal__row--total">
                  <span>Total Refund</span>
                  <strong>{formatCurrency(refundPreview.refundAmount)}</strong>
                </div>
              </div>
            </div>
          )}

          {validationError && <div className="field-error">{validationError}</div>}
        </div>

        <div className="modal__actions">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="button" onClick={handleSubmit}>Process Return</Button>
        </div>
      </div>
    </div>
  )
}

export default NewReturnModal

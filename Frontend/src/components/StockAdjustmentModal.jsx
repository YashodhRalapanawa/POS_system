import { useEffect, useState, useMemo } from 'react'
import Button from './ui/Button'

const defaultForm = {
  adjustmentType: 'increase',
  quantity: 1,
  reason: 'Physical stock correction',
  confirmed: false,
}

function StockAdjustmentModal({ isOpen, onClose, onSubmit, inventoryItem, isSubmitting = false, externalError = null }) {
  const [formData, setFormData] = useState(defaultForm)
  const [error, setError] = useState('')

  const currentStock = useMemo(() => {
    if (!inventoryItem) return 0
    return Number(inventoryItem.currentStock ?? inventoryItem.stock ?? 0)
  }, [inventoryItem])

  const expectedResultingStock = useMemo(() => {
    const qty = Number(formData.quantity) || 0
    if (formData.adjustmentType === 'increase') {
      return currentStock + qty
    } else if (formData.adjustmentType === 'decrease') {
      return currentStock - qty
    }
    return qty
  }, [currentStock, formData.adjustmentType, formData.quantity])

  useEffect(() => {
    if (!isOpen) {
      setFormData(defaultForm)
      setError('')
      return
    }

    setFormData(defaultForm)
    setError('')
  }, [isOpen])

  if (!isOpen || !inventoryItem) return null

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }))
    if (error) setError('')
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const quantity = Number(formData.quantity)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Please enter a valid positive quantity greater than zero.')
      return
    }

    if (!formData.reason || !formData.reason.trim()) {
      setError('Please provide an adjustment reason.')
      return
    }

    if (formData.adjustmentType === 'decrease' && quantity > currentStock) {
      setError(`Cannot decrease stock by ${quantity}. Current stock is only ${currentStock}.`)
      return
    }

    if (!formData.confirmed) {
      setError('Please confirm the adjustment before saving.')
      return
    }

    onSubmit({
      productId: inventoryItem.productId || inventoryItem.id,
      storeId: inventoryItem.storeId || inventoryItem.store?.id || null,
      adjustmentType: formData.adjustmentType,
      quantity,
      reason: formData.reason.trim(),
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="product-form-modal stock-adjustment-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-modal__header">
          <div>
            <span className="section-label">Inventory Adjustment</span>
            <h3>Adjust Stock</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose} disabled={isSubmitting}>×</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Product</span>
              <input value={inventoryItem.productName || inventoryItem.name || ''} readOnly />
            </label>

            <label>
              <span>Current Stock</span>
              <input value={currentStock} readOnly style={{ fontWeight: 600, color: 'var(--accent-primary, #6366f1)' }} />
            </label>

            {inventoryItem.storeName && (
              <label>
                <span>Store</span>
                <input value={inventoryItem.storeName} readOnly />
              </label>
            )}

            <label>
              <span>Adjustment Type</span>
              <select
                value={formData.adjustmentType}
                onChange={(event) => updateField('adjustmentType', event.target.value)}
                disabled={isSubmitting}
              >
                <option value="increase">Increase (+)</option>
                <option value="decrease">Decrease (-)</option>
              </select>
            </label>

            <label>
              <span>Quantity</span>
              <input
                type="number"
                min="1"
                step="any"
                value={formData.quantity}
                onChange={(event) => updateField('quantity', event.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label>
              <span>Expected Resulting Stock</span>
              <input
                value={`${expectedResultingStock} (informational)`}
                readOnly
                style={{
                  fontWeight: 600,
                  color: expectedResultingStock < 0 ? '#ef4444' : '#10b981',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                }}
              />
            </label>

            <label style={{ gridColumn: '1 / -1' }}>
              <span>Reason</span>
              <select
                value={formData.reason}
                onChange={(event) => updateField('reason', event.target.value)}
                disabled={isSubmitting}
              >
                <option value="Physical stock correction">Physical stock correction</option>
                <option value="Stock Count">Stock Count</option>
                <option value="Damaged Goods">Damaged Goods</option>
                <option value="Lost Stock">Lost Stock</option>
                <option value="Found Items">Found Items</option>
                <option value="Inventory Audit">Inventory Audit</option>
                <option value="Expired Stock">Expired Stock</option>
                <option value="Other">Other</option>
              </select>
            </label>

            {formData.reason === 'Other' && (
              <label style={{ gridColumn: '1 / -1' }}>
                <span>Custom Reason Details</span>
                <input
                  type="text"
                  placeholder="Specify adjustment reason..."
                  onChange={(e) => updateField('reason', e.target.value || 'Other')}
                  disabled={isSubmitting}
                />
              </label>
            )}

            <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem', padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={formData.confirmed}
                  onChange={(e) => updateField('confirmed', e.target.checked)}
                  disabled={isSubmitting}
                  style={{ width: 'auto' }}
                />
                <span style={{ fontSize: '0.875rem' }}>
                  I confirm the stock adjustment of <strong>{formData.quantity || 0}</strong> units ({formData.adjustmentType}).
                </span>
              </label>
              <small style={{ display: 'block', marginTop: '0.35rem', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.75rem' }}>
                Note: The expected resulting stock is informational. Backend transaction logic will atomically apply the authoritative stock update.
              </small>
            </div>
          </div>

          {(error || externalError) && (
            <div className="field-error" style={{ marginTop: '0.75rem', color: '#ef4444', fontWeight: 500 }}>
              {error || externalError}
            </div>
          )}

          <div className="product-form__actions" style={{ marginTop: '1.25rem' }}>
            <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Applying...' : 'Apply Adjustment'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default StockAdjustmentModal

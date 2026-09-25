import { useEffect, useState } from 'react'
import Button from './ui/Button'

const defaultForm = {
  adjustmentType: 'Add Stock',
  quantity: 1,
  reason: 'Stock Count',
}

function StockAdjustmentModal({ isOpen, onClose, onSubmit, inventoryItem }) {
  const [formData, setFormData] = useState(defaultForm)
  const [error, setError] = useState('')

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
      setError('Please enter a valid quantity greater than zero.')
      return
    }

    onSubmit({
      ...formData,
      quantity,
      productId: inventoryItem.productId,
      productName: inventoryItem.productName,
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
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Product</span>
              <input value={inventoryItem.productName} readOnly />
            </label>

            <label>
              <span>Current Stock</span>
              <input value={inventoryItem.stock} readOnly />
            </label>

            <label>
              <span>Adjustment Type</span>
              <select value={formData.adjustmentType} onChange={(event) => updateField('adjustmentType', event.target.value)}>
                <option value="Add Stock">Add Stock</option>
                <option value="Remove Stock">Remove Stock</option>
                <option value="Set Stock Level">Set Stock Level</option>
              </select>
            </label>

            <label>
              <span>Quantity</span>
              <input
                type="number"
                min="1"
                value={formData.quantity}
                onChange={(event) => updateField('quantity', event.target.value)}
              />
            </label>

            <label style={{ gridColumn: '1 / -1' }}>
              <span>Reason</span>
              <select value={formData.reason} onChange={(event) => updateField('reason', event.target.value)}>
                <option value="Stock Count">Stock Count</option>
                <option value="Damaged">Damaged</option>
                <option value="Lost">Lost</option>
                <option value="Found">Found</option>
                <option value="Manual Correction">Manual Correction</option>
                <option value="Other">Other</option>
              </select>
            </label>
          </div>

          {error && <div className="field-error">{error}</div>}

          <div className="product-form__actions">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit">Apply Adjustment</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default StockAdjustmentModal

import { useEffect, useState } from 'react'
import Button from './ui/Button'
import { getProducts } from '../services/api'

const defaultForm = {
  productId: '',
  storeId: '',
  quantity: '',
  reason: 'Initial stock entry',
}

function OpeningStockModal({ isOpen, onClose, onSubmit, isSubmitting = false, externalError = null, defaultStoreId = '' }) {
  const [formData, setFormData] = useState(defaultForm)
  const [products, setProducts] = useState([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setFormData({ ...defaultForm, storeId: defaultStoreId || '' })
      setError('')
      return
    }

    setFormData({ ...defaultForm, storeId: defaultStoreId || '' })
    setError('')

    // Fetch products dynamically
    setIsLoadingProducts(true)
    getProducts({ all: true })
      .then((res) => {
        if (res?.ok && res.data?.success) {
          const list = res.data.data?.products || []
          setProducts(list)
          if (list.length > 0 && !formData.productId) {
            setFormData((prev) => ({
              ...prev,
              productId: list[0].id,
              storeId: prev.storeId || list[0].storeId || defaultStoreId || '',
            }))
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsLoadingProducts(false)
      })
  }, [isOpen, defaultStoreId])

  if (!isOpen) return null

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }))
    if (error) setError('')
  }

  const handleProductChange = (productId) => {
    const selected = products.find((p) => p.id === productId)
    setFormData((prev) => ({
      ...prev,
      productId,
      storeId: selected?.storeId || prev.storeId || defaultStoreId || '',
    }))
    if (error) setError('')
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!formData.productId) {
      setError('Please select a product.')
      return
    }

    const quantity = Number(formData.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Please enter a valid positive quantity.')
      return
    }

    if (!formData.reason || !formData.reason.trim()) {
      setError('Please provide a reason for opening stock.')
      return
    }

    onSubmit({
      productId: formData.productId,
      storeId: formData.storeId || null,
      quantity,
      reason: formData.reason.trim(),
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="product-form-modal opening-stock-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-modal__header">
          <div>
            <span className="section-label">Inventory Setup</span>
            <h3>Enter Opening Stock</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose} disabled={isSubmitting}>×</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label style={{ gridColumn: '1 / -1' }}>
              <span>Product *</span>
              <select
                value={formData.productId}
                onChange={(e) => handleProductChange(e.target.value)}
                disabled={isSubmitting || isLoadingProducts}
              >
                {isLoadingProducts ? (
                  <option value="">Loading products...</option>
                ) : products.length === 0 ? (
                  <option value="">No products available</option>
                ) : (
                  products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.sku ? `(${p.sku})` : ''}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label>
              <span>Quantity *</span>
              <input
                type="number"
                min="1"
                step="any"
                placeholder="e.g. 100"
                value={formData.quantity}
                onChange={(e) => updateField('quantity', e.target.value)}
                disabled={isSubmitting}
              />
            </label>

            <label>
              <span>Reason</span>
              <input
                type="text"
                placeholder="Initial stock entry"
                value={formData.reason}
                onChange={(e) => updateField('reason', e.target.value)}
                disabled={isSubmitting}
              />
            </label>
          </div>

          <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: '6px', backgroundColor: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
            <small style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.8rem', display: 'block' }}>
              Opening stock establishes initial stock balances for products. Duplicate opening stock submissions are strictly prevented if stock already exists.
            </small>
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
            <Button variant="primary" type="submit" disabled={isSubmitting || isLoadingProducts || products.length === 0}>
              {isSubmitting ? 'Saving...' : 'Save Opening Stock'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default OpeningStockModal

import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'

const defaultForm = {
  name: '',
  sku: '',
  barcode: '',
  category: 'Accessories',
  purchasePrice: '',
  sellingPrice: '',
  taxRate: 15,
  reorderLevel: '',
  stock: '',
  status: 'In Stock',
}

function ProductFormModal({ isOpen, onClose, onSubmit, mode = 'add', product = null }) {
  const [formData, setFormData] = useState(defaultForm)
  const [errors, setErrors] = useState({})

  const isEditMode = mode === 'edit'

  useEffect(() => {
    if (!isOpen) {
      setFormData(defaultForm)
      setErrors({})
      return
    }

    if (product) {
      setFormData({
        name: product.name || '',
        sku: product.sku || '',
        barcode: product.barcode || '',
        category: product.category || 'Accessories',
        purchasePrice: product.purchasePrice ?? '',
        sellingPrice: product.sellingPrice ?? '',
        taxRate: product.taxRate ?? 15,
        reorderLevel: product.reorderLevel ?? '',
        stock: product.stock ?? '',
        status: product.status || 'In Stock',
      })
    } else {
      setFormData(defaultForm)
    }

    setErrors({})
  }, [isOpen, product])

  const submitLabel = useMemo(() => (isEditMode ? 'Save Changes' : 'Save Product'), [isEditMode])

  if (!isOpen) return null

  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
  }

  const validateForm = () => {
    const nextErrors = {}

    if (!formData.name.trim()) nextErrors.name = 'Product Name is required.'
    if (!formData.sku.trim()) nextErrors.sku = 'SKU is required.'
    if (!formData.barcode.trim()) nextErrors.barcode = 'Barcode is required.'

    const purchasePrice = Number(formData.purchasePrice)
    const sellingPrice = Number(formData.sellingPrice)
    const taxRate = Number(formData.taxRate)
    const reorderLevel = Number(formData.reorderLevel)
    const stock = Number(formData.stock)

    if (!Number.isFinite(purchasePrice) || purchasePrice < 0) nextErrors.purchasePrice = 'Purchase Price cannot be negative.'
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) nextErrors.sellingPrice = 'Selling Price cannot be negative.'
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) nextErrors.taxRate = 'Tax Rate must be between 0 and 100.'
    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) nextErrors.reorderLevel = 'Reorder Level cannot be negative.'
    if (!Number.isFinite(stock) || stock < 0) nextErrors.stock = 'Stock cannot be negative.'

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    if (!validateForm()) {
      return
    }

    onSubmit({
      ...formData,
      name: formData.name.trim(),
      sku: formData.sku.trim(),
      barcode: formData.barcode.trim(),
      purchasePrice: Number(formData.purchasePrice || 0),
      sellingPrice: Number(formData.sellingPrice || 0),
      taxRate: Number(formData.taxRate || 0),
      reorderLevel: Number(formData.reorderLevel || 0),
      stock: Number(formData.stock || 0),
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="product-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="product-form-modal__header">
          <div>
            <span className="section-label">Product Management</span>
            <h3>{isEditMode ? 'Edit Product' : 'Add Product'}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Product Name</span>
              <input value={formData.name} onChange={(event) => updateField('name', event.target.value)} />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </label>
            <label>
              <span>SKU / Item Code</span>
              <input value={formData.sku} onChange={(event) => updateField('sku', event.target.value)} />
              {errors.sku && <span className="field-error">{errors.sku}</span>}
            </label>
            <label>
              <span>Barcode</span>
              <input value={formData.barcode} onChange={(event) => updateField('barcode', event.target.value)} />
              {errors.barcode && <span className="field-error">{errors.barcode}</span>}
            </label>
            <label>
              <span>Category</span>
              <select value={formData.category} onChange={(event) => updateField('category', event.target.value)}>
                <option value="Accessories">Accessories</option>
                <option value="Electronics">Electronics</option>
                <option value="POS Supplies">POS Supplies</option>
                <option value="Office">Office</option>
                <option value="Furniture">Furniture</option>
                <option value="Hardware">Hardware</option>
              </select>
            </label>
            <label>
              <span>Purchase Price</span>
              <input type="number" step="0.01" min="0" value={formData.purchasePrice} onChange={(event) => updateField('purchasePrice', event.target.value)} />
              {errors.purchasePrice && <span className="field-error">{errors.purchasePrice}</span>}
            </label>
            <label>
              <span>Selling Price</span>
              <input type="number" step="0.01" min="0" value={formData.sellingPrice} onChange={(event) => updateField('sellingPrice', event.target.value)} />
              {errors.sellingPrice && <span className="field-error">{errors.sellingPrice}</span>}
            </label>
            <label>
              <span>Tax Rate</span>
              <input type="number" min="0" max="100" value={formData.taxRate} onChange={(event) => updateField('taxRate', event.target.value)} />
              {errors.taxRate && <span className="field-error">{errors.taxRate}</span>}
            </label>
            <label>
              <span>Reorder Level</span>
              <input type="number" min="0" value={formData.reorderLevel} onChange={(event) => updateField('reorderLevel', event.target.value)} />
              {errors.reorderLevel && <span className="field-error">{errors.reorderLevel}</span>}
            </label>
            <label>
              <span>Initial Stock</span>
              <input type="number" min="0" value={formData.stock} onChange={(event) => updateField('stock', event.target.value)} />
              {errors.stock && <span className="field-error">{errors.stock}</span>}
            </label>
            <label>
              <span>Status</span>
              <select value={formData.status} onChange={(event) => updateField('status', event.target.value)}>
                <option value="In Stock">In Stock</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Out of Stock">Out of Stock</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="product-form__actions">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit">{submitLabel}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProductFormModal

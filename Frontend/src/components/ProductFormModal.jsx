import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'

const defaultForm = {
  name: '',
  sku: '',
  barcode: '',
  description: '',
  category: 'Accessories',
  categoryId: null,
  supplier: '',
  supplierId: null,
  unitOfMeasure: 'PCS',
  purchasePrice: '',
  sellingPrice: '',
  taxRate: 15,
  reorderLevel: '',
  stock: '',
  status: 'In Stock',
}

const UOM_OPTIONS = [
  'PCS',
  'UNIT',
  'BOX',
  'PACK',
  'KG',
  'G',
  'L',
  'ML',
  'BOTTLE',
  'CAN',
  'SET',
  'PAIR',
  'M',
  'ROLL',
  'DOZEN',
]

function ProductFormModal({
  isOpen,
  onClose,
  onSubmit,
  mode = 'add',
  product = null,
  categoriesList = [],
  suppliersList = [],
  isSubmitting = false,
  externalError = null,
}) {
  const [formData, setFormData] = useState(defaultForm)
  const [errors, setErrors] = useState({})

  const isEditMode = mode === 'edit'

  const selectableCategories = useMemo(() => {
    // Only active categories are selectable for new assignments
    const activeList = categoriesList.filter((c) => c.status === 'Active' || c.isActive)
    const names = activeList.map((c) => c.name)

    // In edit mode, if the product currently has an inactive category, keep it visible
    if (product?.category && !names.includes(product.category)) {
      names.push(product.category)
    }

    if (names.length === 0) {
      return ['Accessories', 'Electronics', 'POS Supplies', 'Office', 'Furniture', 'Hardware']
    }

    return Array.from(new Set(names))
  }, [categoriesList, product])

  const selectableSuppliers = useMemo(() => {
    // Only active suppliers are selectable for new assignments
    const activeList = suppliersList.filter((s) => s.status === 'Active' || s.isActive)
    const names = activeList.map((s) => s.name)

    // In edit mode, if the product currently has an assigned supplier that is inactive, keep it visible
    if (product?.supplier && !names.includes(product.supplier)) {
      names.push(product.supplier)
    }

    return Array.from(new Set(names))
  }, [suppliersList, product])

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
        description: product.description || '',
        category: product.category || 'Accessories',
        categoryId: product.categoryId || null,
        supplier: product.supplier || '',
        supplierId: product.supplierId || null,
        unitOfMeasure: product.unitOfMeasure || 'PCS',
        purchasePrice: product.purchasePrice ?? product.costPrice ?? '',
        sellingPrice: product.sellingPrice ?? '',
        taxRate: product.taxRate ?? 15,
        reorderLevel: product.reorderLevel ?? '',
        stock: product.stock ?? '',
        status: product.status || (product.isActive === false ? 'Inactive' : 'In Stock'),
      })
    } else {
      setFormData(defaultForm)
    }

    setErrors({})
  }, [isOpen, product])

  const submitLabel = useMemo(() => {
    if (isSubmitting) return 'Saving...'
    return isEditMode ? 'Save Changes' : 'Save Product'
  }, [isSubmitting, isEditMode])

  if (!isOpen) return null

  const updateField = (field, value) => {
    setFormData((current) => {
      const next = { ...current, [field]: value }
      if (field === 'category') {
        const foundCat = categoriesList.find((c) => c.name === value)
        next.categoryId = foundCat ? foundCat.id : null
      }
      if (field === 'supplier') {
        const foundSup = suppliersList.find((s) => s.name === value)
        next.supplierId = foundSup ? foundSup.id : null
      }
      return next
    })
    setErrors((current) => ({ ...current, [field]: '' }))
  }

  const validateForm = () => {
    const nextErrors = {}

    if (!formData.name.trim()) nextErrors.name = 'Product Name is required.'
    if (!formData.sku.trim()) nextErrors.sku = 'SKU is required.'

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

    if (isSubmitting) return

    if (!validateForm()) {
      return
    }

    const matchedCat = categoriesList.find((c) => c.name === formData.category)
    const matchedSup = suppliersList.find((s) => s.name === formData.supplier)

    onSubmit({
      ...formData,
      name: formData.name.trim(),
      sku: formData.sku.trim(),
      barcode: formData.barcode.trim(),
      description: formData.description.trim(),
      category: formData.category,
      categoryId: formData.categoryId || (matchedCat ? matchedCat.id : null),
      supplier: formData.supplier || '',
      supplierId: formData.supplierId || (matchedSup ? matchedSup.id : null),
      unitOfMeasure: formData.unitOfMeasure || 'PCS',
      purchasePrice: Number(formData.purchasePrice || 0),
      costPrice: Number(formData.purchasePrice || 0),
      sellingPrice: Number(formData.sellingPrice || 0),
      taxRate: Number(formData.taxRate || 0),
      reorderLevel: Number(formData.reorderLevel || 0),
      stock: Number(formData.stock || 0),
      isActive: formData.status !== 'Inactive',
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
          <button type="button" className="modal__close" onClick={onClose} disabled={isSubmitting}>×</button>
        </div>

        {externalError && (
          <div className="form-error-banner" style={{ margin: '1rem', padding: '0.75rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '0.875rem' }}>
            {externalError}
          </div>
        )}

        <form className="product-form" onSubmit={handleSubmit}>
          <div className="product-form__grid">
            <label>
              <span>Product Name *</span>
              <input value={formData.name} onChange={(event) => updateField('name', event.target.value)} disabled={isSubmitting} />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </label>
            <label>
              <span>SKU / Item Code *</span>
              <input value={formData.sku} onChange={(event) => updateField('sku', event.target.value)} disabled={isSubmitting} />
              {errors.sku && <span className="field-error">{errors.sku}</span>}
            </label>
            <label>
              <span>Barcode</span>
              <input value={formData.barcode} onChange={(event) => updateField('barcode', event.target.value)} disabled={isSubmitting} />
              {errors.barcode && <span className="field-error">{errors.barcode}</span>}
            </label>
            <label>
              <span>Category</span>
              <select value={formData.category} onChange={(event) => updateField('category', event.target.value)} disabled={isSubmitting}>
                {selectableCategories.map((catName) => {
                  const isInactive = categoriesList.some((c) => c.name === catName && (c.status === 'Inactive' || c.isActive === false))
                  return (
                    <option key={catName} value={catName}>
                      {catName}{isInactive ? ' (Inactive)' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            <label>
              <span>Supplier</span>
              <select value={formData.supplier || ''} onChange={(event) => updateField('supplier', event.target.value)} disabled={isSubmitting}>
                <option value="">Select Supplier</option>
                {selectableSuppliers.map((supName) => {
                  const isInactive = suppliersList.some((s) => s.name === supName && (s.status === 'Inactive' || s.isActive === false))
                  return (
                    <option key={supName} value={supName}>
                      {supName}{isInactive ? ' (Inactive)' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            <label>
              <span>Unit of Measure</span>
              <select value={formData.unitOfMeasure} onChange={(event) => updateField('unitOfMeasure', event.target.value)} disabled={isSubmitting}>
                {UOM_OPTIONS.map((uom) => (
                  <option key={uom} value={uom}>{uom}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Purchase / Cost Price</span>
              <input type="number" step="0.01" min="0" value={formData.purchasePrice} onChange={(event) => updateField('purchasePrice', event.target.value)} disabled={isSubmitting} />
              {errors.purchasePrice && <span className="field-error">{errors.purchasePrice}</span>}
            </label>
            <label>
              <span>Selling Price</span>
              <input type="number" step="0.01" min="0" value={formData.sellingPrice} onChange={(event) => updateField('sellingPrice', event.target.value)} disabled={isSubmitting} />
              {errors.sellingPrice && <span className="field-error">{errors.sellingPrice}</span>}
            </label>
            <label>
              <span>Tax Rate (%)</span>
              <input type="number" min="0" max="100" value={formData.taxRate} onChange={(event) => updateField('taxRate', event.target.value)} disabled={isSubmitting} />
              {errors.taxRate && <span className="field-error">{errors.taxRate}</span>}
            </label>
            <label>
              <span>Reorder Level</span>
              <input type="number" min="0" value={formData.reorderLevel} onChange={(event) => updateField('reorderLevel', event.target.value)} disabled={isSubmitting} />
              {errors.reorderLevel && <span className="field-error">{errors.reorderLevel}</span>}
            </label>
            <label>
              <span>{isEditMode ? 'Stock Quantity (Managed via Inventory)' : 'Initial Stock (Optional)'}</span>
              <input
                type="number"
                min="0"
                value={formData.stock}
                onChange={(event) => updateField('stock', event.target.value)}
                disabled={isSubmitting || isEditMode}
                title={isEditMode ? 'Stock quantity must be modified via Inventory Adjustments or Opening Stock' : ''}
              />
              {errors.stock && <span className="field-error">{errors.stock}</span>}
              {isEditMode && (
                <small style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.75rem', display: 'block', marginTop: '0.2rem' }}>
                  Direct editing disabled. Use Inventory Adjustments.
                </small>
              )}
            </label>
            <label>
              <span>Status</span>
              <select value={formData.status} onChange={(event) => updateField('status', event.target.value)} disabled={isSubmitting}>
                <option value="In Stock">In Stock (Active)</option>
                <option value="Low Stock">Low Stock (Active)</option>
                <option value="Out of Stock">Out of Stock (Active)</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div style={{ padding: '0 1.5rem 1rem' }}>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>Description</span>
              <textarea
                style={{ width: '100%', minHeight: '60px', borderRadius: '6px', border: '1px solid var(--border-color, #e2e8f0)', padding: '0.5rem', fontFamily: 'inherit', resize: 'vertical' }}
                value={formData.description}
                onChange={(event) => updateField('description', event.target.value)}
                placeholder="Product description or notes..."
                disabled={isSubmitting}
              />
            </label>
          </div>

          <div className="product-form__actions">
            <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={isSubmitting}>{submitLabel}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProductFormModal

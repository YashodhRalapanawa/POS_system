import { useEffect, useState } from 'react'
import Button from './ui/Button'

const emptyFilters = {
  minPrice: '',
  maxPrice: '',
  taxRate: '',
  minStock: '',
  maxStock: '',
}

function ProductAdvancedFiltersModal({ isOpen, onClose, currentFilters, onApply, onReset }) {
  const [filters, setFilters] = useState(emptyFilters)

  useEffect(() => {
    if (!isOpen) return
    setFilters(currentFilters)
  }, [isOpen, currentFilters])

  if (!isOpen) return null

  const updateField = (field, value) => {
    if (value === '') {
      setFilters((current) => ({ ...current, [field]: '' }))
      return
    }

    const numericValue = Number(value)
    if (Number.isNaN(numericValue)) {
      return
    }

    setFilters((current) => ({
      ...current,
      [field]: numericValue < 0 ? '0' : String(numericValue),
    }))
  }

  const handleApply = () => {
    onApply(filters)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal product-filters-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Advanced Filters</span>
            <h3>More Filters</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="product-filters-modal__body">
          <div className="product-filters-modal__section">
            <h4>Price Range</h4>
            <div className="product-filter-grid">
              <label>
                <span>Minimum Selling Price</span>
                <input type="number" step="0.01" min="0" value={filters.minPrice} onChange={(event) => updateField('minPrice', event.target.value)} placeholder="0.00" />
              </label>
              <label>
                <span>Maximum Selling Price</span>
                <input type="number" step="0.01" min="0" value={filters.maxPrice} onChange={(event) => updateField('maxPrice', event.target.value)} placeholder="0.00" />
              </label>
            </div>
          </div>

          <div className="product-filters-modal__section">
            <h4>Tax</h4>
            <div className="product-filter-grid single-column">
              <label>
                <span>Tax Rate</span>
                <input type="number" step="1" min="0" max="100" value={filters.taxRate} onChange={(event) => updateField('taxRate', event.target.value)} placeholder="15" />
              </label>
            </div>
          </div>

          <div className="product-filters-modal__section">
            <h4>Stock Range</h4>
            <div className="product-filter-grid">
              <label>
                <span>Minimum Stock</span>
                <input type="number" step="1" min="0" value={filters.minStock} onChange={(event) => updateField('minStock', event.target.value)} placeholder="0" />
              </label>
              <label>
                <span>Maximum Stock</span>
                <input type="number" step="1" min="0" value={filters.maxStock} onChange={(event) => updateField('maxStock', event.target.value)} placeholder="0" />
              </label>
            </div>
          </div>
        </div>

        <div className="modal__actions">
          <Button variant="secondary" type="button" onClick={onReset}>Reset</Button>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="button" onClick={handleApply}>Apply Filters</Button>
        </div>
      </div>
    </div>
  )
}

export default ProductAdvancedFiltersModal

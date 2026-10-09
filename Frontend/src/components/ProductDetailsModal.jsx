import Button from './ui/Button'
import Badge from './ui/Badge'
import { useCurrency } from '../context/CurrencyContext'

function ProductDetailsModal({ product, onClose }) {
  const { formatCurrency } = useCurrency()
  if (!product) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal product-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Product Details</span>
            <h3>{product.name}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="product-details-modal__content">
          <div className="product-details-modal__header-row">
            <span>Product</span>
            <Badge tone={product.status === 'In Stock' ? 'success' : product.status === 'Low Stock' ? 'warning' : product.status === 'Out of Stock' ? 'danger' : 'warning'}>{product.status}</Badge>
          </div>

          <div className="product-details-modal__grid">
            <div className="modal__row"><span>SKU / Item Code</span><strong>{product.sku}</strong></div>
            <div className="modal__row"><span>Barcode</span><strong>{product.barcode || 'N/A'}</strong></div>
            <div className="modal__row"><span>Category</span><strong>{product.category || 'Unassigned'}</strong></div>
            {product.supplier && <div className="modal__row"><span>Supplier</span><strong>{product.supplier}</strong></div>}
            <div className="modal__row"><span>Unit of Measure</span><strong>{product.unitOfMeasure || 'PCS'}</strong></div>
            {product.purchasePrice !== undefined && product.purchasePrice !== null && (
              <div className="modal__row"><span>Cost Price</span><strong>{formatCurrency(product.purchasePrice)}</strong></div>
            )}
            <div className="modal__row"><span>Selling Price</span><strong>{formatCurrency(product.sellingPrice)}</strong></div>
            <div className="modal__row"><span>Tax Rate</span><strong>{product.taxRate}%</strong></div>
            <div className="modal__row"><span>Stock</span><strong>{product.stock}</strong></div>
            <div className="modal__row"><span>Reorder Level</span><strong>{product.reorderLevel}</strong></div>
            {product.description && (
              <div className="modal__row" style={{ gridColumn: 'span 2' }}>
                <span>Description</span>
                <p style={{ margin: '0.25rem 0 0', fontWeight: 'normal', color: 'var(--text-secondary, #64748b)' }}>{product.description}</p>
              </div>
            )}
          </div>
        </div>

        <div className="modal__actions">
          <Button variant="primary" type="button" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

export default ProductDetailsModal

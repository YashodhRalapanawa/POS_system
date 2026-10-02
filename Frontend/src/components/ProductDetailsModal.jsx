import Button from './ui/Button'
import Badge from './ui/Badge'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function ProductDetailsModal({ product, onClose }) {
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
            <div className="modal__row"><span>Barcode</span><strong>{product.barcode}</strong></div>
            <div className="modal__row"><span>Category</span><strong>{product.category}</strong></div>
            <div className="modal__row"><span>Purchase Price</span><strong>{formatCurrency(product.purchasePrice)}</strong></div>
            <div className="modal__row"><span>Selling Price</span><strong>{formatCurrency(product.sellingPrice)}</strong></div>
            <div className="modal__row"><span>Tax Rate</span><strong>{product.taxRate}%</strong></div>
            <div className="modal__row"><span>Stock</span><strong>{product.stock}</strong></div>
            <div className="modal__row"><span>Reorder Level</span><strong>{product.reorderLevel}</strong></div>
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

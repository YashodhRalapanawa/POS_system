import Badge from './ui/Badge'
import Button from './ui/Button'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function getInventoryStatus(stock, reorderLevel) {
  if (stock === 0) return 'Out of Stock'
  if (stock <= reorderLevel) return 'Low Stock'
  return 'In Stock'
}

function InventoryDetailsModal({ inventoryItem, onClose }) {
  if (!inventoryItem) return null

  const stockStatus = getInventoryStatus(inventoryItem.stock, inventoryItem.reorderLevel)
  const stockPosition = inventoryItem.stock - inventoryItem.reorderLevel
  const stockPositionText = stockPosition >= 0
    ? `${stockPosition} units above reorder level`
    : `${Math.abs(stockPosition)} units below reorder level`

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal inventory-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Inventory Details</span>
            <h3>{inventoryItem.productName}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="modal__body">
          <div className="modal__row">
            <span>SKU</span>
            <strong>{inventoryItem.sku}</strong>
          </div>

          <div className="modal__row">
            <span>Barcode</span>
            <strong>{inventoryItem.barcode}</strong>
          </div>

          <div className="modal__row">
            <span>Category</span>
            <strong>{inventoryItem.category}</strong>
          </div>

          <div className="modal__row">
            <span>Supplier</span>
            <strong>{inventoryItem.supplier}</strong>
          </div>

          <div className="modal__row">
            <span>Current Stock</span>
            <strong>{inventoryItem.stock}</strong>
          </div>

          <div className="modal__row">
            <span>Reorder Level</span>
            <strong>{inventoryItem.reorderLevel}</strong>
          </div>

          <div className="modal__row">
            <span>Purchase Price</span>
            <strong>{formatCurrency(inventoryItem.purchasePrice)}</strong>
          </div>

          <div className="modal__row">
            <span>Selling Price</span>
            <strong>{formatCurrency(inventoryItem.sellingPrice)}</strong>
          </div>

          <div className="modal__row">
            <span>Stock Value</span>
            <strong>{formatCurrency(inventoryItem.stock * inventoryItem.purchasePrice)}</strong>
          </div>

          <div className="modal__row">
            <span>Status</span>
            <strong>
              <Badge tone={stockStatus === 'In Stock' ? 'success' : stockStatus === 'Low Stock' ? 'warning' : 'danger'}>{stockStatus}</Badge>
            </strong>
          </div>

          <div className="modal__row">
            <span>Last Updated</span>
            <strong>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(inventoryItem.updatedAt))}</strong>
          </div>

          <div className="modal__row modal__row--total">
            <span>Inventory Position</span>
            <strong>{stockPositionText}</strong>
          </div>
        </div>

        <div className="modal__actions">
          <Button variant="primary" type="button" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

export default InventoryDetailsModal

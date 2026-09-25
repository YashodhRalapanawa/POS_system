import { useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import StockAdjustmentModal from './StockAdjustmentModal'
import InventoryDetailsModal from './InventoryDetailsModal'
import { initialInventory, inventoryCategories, inventoryStatusOptions } from '../data/mockInventory'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function getInventoryStatus(stock, reorderLevel) {
  if (stock === 0) return 'Out of Stock'
  if (stock <= reorderLevel) return 'Low Stock'
  return 'In Stock'
}

function InventoryPage() {
  const [inventory, setInventory] = useState(initialInventory)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All Categories')
  const [stockStatusFilter, setStockStatusFilter] = useState('All Status')
  const [supplierFilter, setSupplierFilter] = useState('All Suppliers')
  const [selectedItemId, setSelectedItemId] = useState(null)
  const [viewedItemId, setViewedItemId] = useState(null)

  const supplierOptions = useMemo(
    () => ['All Suppliers', ...new Set(inventory.map((item) => item.supplier))],
    [inventory],
  )

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [item.productName, item.sku, item.barcode].join(' ').toLowerCase().includes(searchText)

      const matchesCategory = categoryFilter === 'All Categories' || item.category === categoryFilter
      const matchesSupplier = supplierFilter === 'All Suppliers' || item.supplier === supplierFilter
      const status = getInventoryStatus(item.stock, item.reorderLevel)
      const matchesStatus = stockStatusFilter === 'All Status' || status === stockStatusFilter

      return matchesSearch && matchesCategory && matchesSupplier && matchesStatus
    })
  }, [inventory, search, categoryFilter, stockStatusFilter, supplierFilter])

  const totalItems = inventory.length
  const inStockCount = inventory.filter((item) => getInventoryStatus(item.stock, item.reorderLevel) === 'In Stock').length
  const lowStockCount = inventory.filter((item) => getInventoryStatus(item.stock, item.reorderLevel) === 'Low Stock').length
  const outOfStockCount = inventory.filter((item) => getInventoryStatus(item.stock, item.reorderLevel) === 'Out of Stock').length
  const totalStockValue = inventory.reduce((total, item) => total + item.stock * item.purchasePrice, 0)

  const selectedItem = inventory.find((item) => item.id === selectedItemId) ?? null
  const viewedItem = inventory.find((item) => item.id === viewedItemId) ?? null

  const handleAdjustment = ({ quantity, adjustmentType, reason }) => {
    if (selectedItemId === null) return

    setInventory((currentInventory) =>
      currentInventory.map((item) => {
        if (item.id !== selectedItemId) return item

        const nextStock =
          adjustmentType === 'Add Stock'
            ? item.stock + quantity
            : adjustmentType === 'Remove Stock'
              ? Math.max(0, item.stock - quantity)
              : quantity

        return {
          ...item,
          stock: nextStock,
          updatedAt: new Date().toISOString(),
        }
      }),
    )

    setSelectedItemId(null)
  }

  return (
    <div className="products-page inventory-page">
      <header className="products-page__header inventory-page__header">
        <div>
          <span className="section-label">INVENTORY CONTROL</span>
          <h2>Inventory</h2>
          <p>Monitor stock levels, identify inventory risks, and manage stock adjustments across your store.</p>
        </div>

      </header>

      <section className="products-kpis inventory-kpis">
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Items</span>
          <strong className="kpi-card__value small">{totalItems}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">In Stock</span>
          <strong className="kpi-card__value small">{inStockCount}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Low Stock</span>
          <strong className="kpi-card__value small">{lowStockCount}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Out of Stock</span>
          <strong className="kpi-card__value small">{outOfStockCount}</strong>
        </Card>

        <Card className="products-kpis__card inventory-kpis__card--value">
          <span className="kpi-card__label">Total Stock Value</span>
          <strong className="kpi-card__value small">{formatCurrency(totalStockValue)}</strong>
        </Card>
      </section>

      <Card className="products-toolbar-card inventory-toolbar-card">
        <div className="products-toolbar inventory-toolbar">
          <div className="products-toolbar__search">
            <input
              type="text"
              placeholder="Search products, SKU or barcode..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            {inventoryCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

          <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
            {supplierOptions.map((supplier) => (
              <option key={supplier} value={supplier}>{supplier}</option>
            ))}
          </select>

          <select value={stockStatusFilter} onChange={(event) => setStockStatusFilter(event.target.value)}>
            {inventoryStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="products-table-card inventory-table-card">
        <div className="products-table-wrap">
          <table className="products-table inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Supplier</th>
                <th>Stock</th>
                <th>Reorder Level</th>
                <th>Purchase Price</th>
                <th>Stock Value</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan="11">
                    <div className="inventory-empty-state">
                      <strong>No inventory items found</strong>
                      <span>Try adjusting your search or filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => {
                  const status = getInventoryStatus(item.stock, item.reorderLevel)

                  return (
                    <tr key={item.id}>
                      <td>
                        <div className="product-cell inventory-product-cell">
                          <div className="product-cell__dot" aria-hidden="true" />
                          <div>
                            <div className="inventory-product-name">{item.productName}</div>
                            <div className="inventory-product-meta">{item.barcode}</div>
                          </div>
                        </div>
                      </td>
                      <td>{item.sku}</td>
                      <td>{item.category}</td>
                      <td>{item.supplier}</td>
                      <td>{item.stock}</td>
                      <td>{item.reorderLevel}</td>
                      <td>{formatCurrency(item.purchasePrice)}</td>
                      <td>{formatCurrency(item.stock * item.purchasePrice)}</td>
                      <td>
                        <Badge tone={status === 'In Stock' ? 'success' : status === 'Low Stock' ? 'warning' : 'danger'}>{status}</Badge>
                      </td>
                      <td>{formatDate(item.updatedAt)}</td>
                      <td>
                        <div className="product-row-actions">
                          <button type="button" onClick={() => setViewedItemId(item.id)}>View</button>
                          <button type="button" onClick={() => setSelectedItemId(item.id)}>
                            Adjust Stock
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <StockAdjustmentModal
        isOpen={selectedItemId !== null}
        onClose={() => setSelectedItemId(null)}
        onSubmit={handleAdjustment}
        inventoryItem={selectedItem}
      />

      <InventoryDetailsModal inventoryItem={viewedItem} onClose={() => setViewedItemId(null)} />
    </div>
  )
}

export default InventoryPage

import { useEffect, useMemo, useState, useCallback } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import StockAdjustmentModal from './StockAdjustmentModal'
import InventoryDetailsModal from './InventoryDetailsModal'
import OpeningStockModal from './OpeningStockModal'
import {
  getInventory,
  getInventoryMovements,
  createStockAdjustment,
  createOpeningStock,
  getCategories,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import { PERMISSIONS, hasPermission } from '../auth/permissions'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value || 0)
}

function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function getBadgeToneForStatus(status) {
  if (status === 'In Stock') return 'success'
  if (status === 'Low Stock') return 'warning'
  return 'danger'
}

function getBadgeToneForMovement(type) {
  const t = String(type || '').toLowerCase()
  if (t.includes('in') || t.includes('add') || t.includes('increase') || t.includes('opening')) return 'success'
  if (t.includes('out') || t.includes('remove') || t.includes('decrease') || t.includes('sale')) return 'danger'
  return 'info'
}

function InventoryPage() {
  const { user } = useAuth()

  // Dynamic permission checks
  const canViewInventory = useMemo(
    () => hasPermission(user, PERMISSIONS.INVENTORY_VIEW) || hasPermission(user, PERMISSIONS.INVENTORY_MANAGE),
    [user],
  )
  const canAdjustInventory = useMemo(
    () => hasPermission(user, PERMISSIONS.INVENTORY_ADJUST) || hasPermission(user, PERMISSIONS.INVENTORY_MANAGE),
    [user],
  )

  // Navigation tab: 'balances' or 'movements'
  const [activeTab, setActiveTab] = useState('balances')

  // Stock balances state
  const [inventory, setInventory] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState(null)
  const [notification, setNotification] = useState(null)

  // Filters for stock balances
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All Categories')
  const [stockStatusFilter, setStockStatusFilter] = useState('All Status')
  const [storeFilter, setStoreFilter] = useState('All Stores')
  const [availableCategories, setAvailableCategories] = useState([])

  // Modal states
  const [selectedItemForAdjust, setSelectedItemForAdjust] = useState(null)
  const [viewedItem, setViewedItem] = useState(null)
  const [isOpeningStockOpen, setIsOpeningStockOpen] = useState(false)
  const [isSubmittingAction, setIsSubmittingAction] = useState(false)
  const [actionError, setActionError] = useState(null)

  // Movements state
  const [movements, setMovements] = useState([])
  const [isLoadingMovements, setIsLoadingMovements] = useState(false)
  const [movementTypeFilter, setMovementTypeFilter] = useState('All Types')
  const [movementSearch, setMovementSearch] = useState('')

  const showNotification = (message, tone = 'success') => {
    setNotification({ message, tone })
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr))
    }, 4500)
  }

  // Fetch Inventory Balances
  const fetchInventoryBalances = useCallback(async () => {
    if (!canViewInventory) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const res = await getInventory({ all: true })
      if (res?.ok && res.data?.success) {
        setInventory(res.data.data?.inventory || [])
      } else {
        setErrorMessage(res?.data?.message || 'Failed to load inventory balances.')
      }
    } catch (err) {
      setErrorMessage(err.message || 'Error connecting to inventory service.')
    } finally {
      setIsLoading(false)
    }
  }, [canViewInventory])

  // Fetch Movement History
  const fetchMovements = useCallback(async () => {
    if (!canViewInventory) return
    setIsLoadingMovements(true)
    try {
      const res = await getInventoryMovements({ limit: 100 })
      if (res?.ok && res.data?.success) {
        setMovements(res.data.data?.movements || [])
      }
    } catch (err) {
      // Movement loading error handled quietly
    } finally {
      setIsLoadingMovements(false)
    }
  }, [canViewInventory])

  useEffect(() => {
    fetchInventoryBalances()
    fetchMovements()

    getCategories({ all: true })
      .then((res) => {
        if (res?.ok && res.data?.success) {
          const cats = res.data.data?.categories || []
          setAvailableCategories(cats)
        }
      })
      .catch(() => {})
  }, [fetchInventoryBalances, fetchMovements])

  // Store options derived from inventory records
  const storeOptions = useMemo(() => {
    const names = inventory.map((i) => i.storeName).filter(Boolean)
    return ['All Stores', ...Array.from(new Set(names))]
  }, [inventory])

  // Filtered Inventory Balances
  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [item.productName, item.sku, item.barcode].join(' ').toLowerCase().includes(searchText)

      const matchesCategory =
        categoryFilter === 'All Categories' || item.category === categoryFilter
      const matchesStore =
        storeFilter === 'All Stores' || item.storeName === storeFilter
      const matchesStatus =
        stockStatusFilter === 'All Status' || item.status === stockStatusFilter

      return matchesSearch && matchesCategory && matchesStore && matchesStatus
    })
  }, [inventory, search, categoryFilter, storeFilter, stockStatusFilter])

  // Filtered Movements
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const term = movementSearch.trim().toLowerCase()
      const matchesTerm =
        !term ||
        [m.productName, m.sku, m.storeName, m.referenceNumber, m.reason]
          .join(' ')
          .toLowerCase()
          .includes(term)

      const matchesType =
        movementTypeFilter === 'All Types' ||
        String(m.movementType || '').toLowerCase() === movementTypeFilter.toLowerCase()

      return matchesTerm && matchesType
    })
  }, [movements, movementSearch, movementTypeFilter])

  // KPI Calculations
  const totalItems = inventory.length
  const inStockCount = inventory.filter((item) => item.status === 'In Stock').length
  const lowStockCount = inventory.filter((item) => item.status === 'Low Stock').length
  const outOfStockCount = inventory.filter((item) => item.status === 'Out of Stock').length
  const totalStockValue = inventory.reduce(
    (total, item) => total + (Number(item.stock || 0) * Number(item.purchasePrice || item.costPrice || 0)),
    0,
  )

  // Handle Stock Adjustment Submit
  const handleAdjustmentSubmit = async (payload) => {
    setIsSubmittingAction(true)
    setActionError(null)
    try {
      const res = await createStockAdjustment(payload)
      if (res?.ok && res.data?.success) {
        showNotification(
          `Stock successfully adjusted for ${selectedItemForAdjust?.productName || 'product'}. New balance: ${res.data.data?.stockBalance?.currentStock ?? 'updated'}.`
        )
        setSelectedItemForAdjust(null)
        await fetchInventoryBalances()
        await fetchMovements()
      } else {
        setActionError(res?.data?.message || 'Failed to apply stock adjustment.')
      }
    } catch (err) {
      setActionError(err.message || 'An unexpected error occurred during stock adjustment.')
    } finally {
      setIsSubmittingAction(false)
    }
  }

  // Handle Opening Stock Submit
  const handleOpeningStockSubmit = async (payload) => {
    setIsSubmittingAction(true)
    setActionError(null)
    try {
      const res = await createOpeningStock(payload)
      if (res?.ok && res.data?.success) {
        showNotification('Opening stock recorded successfully!')
        setIsOpeningStockOpen(false)
        await fetchInventoryBalances()
        await fetchMovements()
      } else {
        setActionError(res?.data?.message || 'Failed to record opening stock.')
      }
    } catch (err) {
      setActionError(err.message || 'An unexpected error occurred during opening stock entry.')
    } finally {
      setIsSubmittingAction(false)
    }
  }

  if (!canViewInventory) {
    return (
      <div className="products-page inventory-page" style={{ padding: '2rem' }}>
        <Card style={{ padding: '2.5rem', textAlign: 'center' }}>
          <h3 style={{ color: '#ef4444', marginBottom: '0.75rem' }}>Access Denied</h3>
          <p style={{ color: 'var(--text-secondary, #94a3b8)' }}>
            You do not have permission to view inventory records. Please contact your system administrator.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="products-page inventory-page">
      {/* Toast Notification */}
      {notification && (
        <div
          style={{
            padding: '0.75rem 1.25rem',
            marginBottom: '1rem',
            borderRadius: '6px',
            backgroundColor: notification.tone === 'danger' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
            color: notification.tone === 'danger' ? '#ef4444' : '#16a34a',
            fontWeight: 500,
          }}
        >
          {notification.message}
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            padding: '0.75rem 1.25rem',
            marginBottom: '1rem',
            borderRadius: '6px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            fontWeight: 500,
          }}
        >
          {errorMessage}
        </div>
      )}

      <header className="products-page__header inventory-page__header">
        <div>
          <span className="section-label">INVENTORY CONTROL</span>
          <h2>Inventory Management</h2>
          <p>Monitor real-time stock balances, enter opening stock, audit movements, and perform controlled adjustments.</p>
        </div>

        <div className="products-page__actions">
          {canAdjustInventory && (
            <Button
              variant="primary"
              type="button"
              onClick={() => {
                setActionError(null)
                setIsOpeningStockOpen(true)
              }}
            >
              + Opening Stock
            </Button>
          )}
        </div>
      </header>

      {/* KPI Cards */}
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

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <Button
          variant={activeTab === 'balances' ? 'primary' : 'secondary'}
          type="button"
          onClick={() => setActiveTab('balances')}
        >
          Stock Balances
        </Button>
        <Button
          variant={activeTab === 'movements' ? 'primary' : 'secondary'}
          type="button"
          onClick={() => setActiveTab('movements')}
        >
          Movement History ({movements.length})
        </Button>
      </div>

      {activeTab === 'balances' ? (
        <>
          {/* Balances Toolbar */}
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

              <select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}>
                {storeOptions.map((store) => (
                  <option key={store} value={store}>{store}</option>
                ))}
              </select>

              <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="All Categories">All Categories</option>
                {availableCategories.map((category) => (
                  <option key={category.id || category.name} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>

              <select value={stockStatusFilter} onChange={(event) => setStockStatusFilter(event.target.value)}>
                <option value="All Status">All Status</option>
                <option value="In Stock">In Stock</option>
                <option value="Low Stock">Low Stock</option>
                <option value="Out of Stock">Out of Stock</option>
              </select>
            </div>
          </Card>

          {/* Balances Table */}
          <Card className="products-table-card inventory-table-card">
            <div className="products-table-wrap">
              <table className="products-table inventory-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Store</th>
                    <th>Category</th>
                    <th>Stock</th>
                    <th>UOM</th>
                    <th>Reorder Level</th>
                    <th>Cost Price</th>
                    <th>Stock Value</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan="12" style={{ textAlign: 'center', padding: '2.5rem' }}>
                        Loading inventory balances...
                      </td>
                    </tr>
                  ) : filteredInventory.length === 0 ? (
                    <tr>
                      <td colSpan="12">
                        <div className="inventory-empty-state" style={{ textAlign: 'center', padding: '2rem' }}>
                          <strong>No inventory records found</strong>
                          <p style={{ marginTop: '0.25rem', color: 'var(--text-secondary, #94a3b8)' }}>
                            Try adjusting your search or filters, or enter initial opening stock.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredInventory.map((item) => {
                      const tone = getBadgeToneForStatus(item.status)
                      const stockVal = Number(item.stock || 0) * Number(item.purchasePrice || item.costPrice || 0)

                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="product-cell inventory-product-cell">
                              <div className="product-cell__dot" aria-hidden="true" />
                              <div>
                                <div className="inventory-product-name">{item.productName}</div>
                                {item.barcode && <div className="inventory-product-meta">{item.barcode}</div>}
                              </div>
                            </div>
                          </td>
                          <td>{item.sku}</td>
                          <td>{item.storeName || '—'}</td>
                          <td>{item.category || '—'}</td>
                          <td>
                            <strong style={{ fontSize: '1rem', color: item.stock <= 0 ? '#ef4444' : 'inherit' }}>
                              {item.stock}
                            </strong>
                          </td>
                          <td>{item.unitOfMeasure || 'PCS'}</td>
                          <td>{item.reorderLevel}</td>
                          <td>{formatCurrency(item.purchasePrice || item.costPrice)}</td>
                          <td>{formatCurrency(stockVal)}</td>
                          <td>
                            <Badge tone={tone}>{item.status}</Badge>
                          </td>
                          <td>{formatDate(item.updatedAt)}</td>
                          <td>
                            <div className="product-row-actions">
                              <button type="button" onClick={() => setViewedItem(item)}>
                                View
                              </button>
                              {canAdjustInventory && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionError(null)
                                    setSelectedItemForAdjust(item)
                                  }}
                                >
                                  Adjust Stock
                                </button>
                              )}
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
        </>
      ) : (
        /* Movements Tab */
        <>
          <Card className="products-toolbar-card inventory-toolbar-card">
            <div className="products-toolbar inventory-toolbar">
              <div className="products-toolbar__search">
                <input
                  type="text"
                  placeholder="Search movement by product, SKU, reference or reason..."
                  value={movementSearch}
                  onChange={(e) => setMovementSearch(e.target.value)}
                />
              </div>

              <select
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value)}
              >
                <option value="All Types">All Types</option>
                <option value="Opening Stock">Opening Stock</option>
                <option value="Adjustment">Adjustment</option>
                <option value="Stock In">Stock In</option>
                <option value="Stock Out">Stock Out</option>
                <option value="Purchase">Purchase</option>
                <option value="Sale">Sale</option>
              </select>
            </div>
          </Card>

          <Card className="products-table-card inventory-table-card">
            <div className="products-table-wrap">
              <table className="products-table inventory-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Store</th>
                    <th>Type</th>
                    <th>Quantity Change</th>
                    <th>Previous</th>
                    <th>New Balance</th>
                    <th>Reference</th>
                    <th>Reason</th>
                    <th>Created By</th>
                  </tr>
                </thead>

                <tbody>
                  {isLoadingMovements ? (
                    <tr>
                      <td colSpan="11" style={{ textAlign: 'center', padding: '2.5rem' }}>
                        Loading movement history...
                      </td>
                    </tr>
                  ) : filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan="11">
                        <div className="inventory-empty-state" style={{ textAlign: 'center', padding: '2rem' }}>
                          <strong>No inventory movements found</strong>
                          <p style={{ marginTop: '0.25rem', color: 'var(--text-secondary, #94a3b8)' }}>
                            Stock movements will appear here automatically when opening stock or adjustments are saved.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((m) => {
                      const isPositive = Number(m.quantityChange) > 0 || String(m.adjustmentType || '').toLowerCase() === 'increase'
                      const changePrefix = isPositive ? '+' : ''
                      return (
                        <tr key={m.id}>
                          <td>{formatDate(m.createdAt)}</td>
                          <td><strong>{m.productName}</strong></td>
                          <td>{m.sku || '—'}</td>
                          <td>{m.storeName || '—'}</td>
                          <td>
                            <Badge tone={getBadgeToneForMovement(m.movementType)}>
                              {m.movementType}
                            </Badge>
                          </td>
                          <td style={{ fontWeight: 600, color: isPositive ? '#10b981' : '#ef4444' }}>
                            {changePrefix}{m.quantityChange ?? m.quantity}
                          </td>
                          <td>{m.quantityBefore ?? '—'}</td>
                          <td><strong>{m.quantityAfter ?? '—'}</strong></td>
                          <td>{m.referenceNumber || '—'}</td>
                          <td>{m.reason || '—'}</td>
                          <td>{m.createdByName || 'System'}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Stock Adjustment Modal */}
      <StockAdjustmentModal
        isOpen={selectedItemForAdjust !== null}
        onClose={() => {
          setSelectedItemForAdjust(null)
          setActionError(null)
        }}
        onSubmit={handleAdjustmentSubmit}
        inventoryItem={selectedItemForAdjust}
        isSubmitting={isSubmittingAction}
        externalError={actionError}
      />

      {/* Opening Stock Modal */}
      <OpeningStockModal
        isOpen={isOpeningStockOpen}
        onClose={() => {
          setIsOpeningStockOpen(false)
          setActionError(null)
        }}
        onSubmit={handleOpeningStockSubmit}
        isSubmitting={isSubmittingAction}
        externalError={actionError}
        defaultStoreId={user?.storeId || user?.store_id || ''}
      />

      {/* Inventory Item Details Modal */}
      <InventoryDetailsModal
        inventoryItem={viewedItem}
        onClose={() => setViewedItem(null)}
      />
    </div>
  )
}

export default InventoryPage

import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import ProductFormModal from './ProductFormModal'
import ProductDetailsModal from './ProductDetailsModal'
import ProductImportModal from './ProductImportModal'
import ProductAdvancedFiltersModal from './ProductAdvancedFiltersModal'
import { initialProducts, productCategories, stockStatusOptions } from '../data/mockProducts'
import {
  getCategories,
  getSuppliers,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStatus,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import { PERMISSIONS, hasPermission } from '../auth/permissions'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function ProductsPage() {
  const { user } = useAuth()
  const [products, setProducts] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [notification, setNotification] = useState(null)

  const [availableCategories, setAvailableCategories] = useState([])
  const [availableSuppliers, setAvailableSuppliers] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All Categories')
  const [supplierFilter, setSupplierFilter] = useState('All Suppliers')
  const [stockFilter, setStockFilter] = useState('All Stock Status')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formExternalError, setFormExternalError] = useState(null)
  const [editingProduct, setEditingProduct] = useState(null)
  const [viewingProduct, setViewingProduct] = useState(null)
  const [statusTargetProduct, setStatusTargetProduct] = useState(null)

  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState({
    minPrice: '',
    maxPrice: '',
    taxRate: '',
    minStock: '',
    maxStock: '',
  })

  // Permission authorization checks
  const canViewProducts = useMemo(
    () => hasPermission(user, PERMISSIONS.PRODUCTS_VIEW) || hasPermission(user, PERMISSIONS.PRODUCTS_MANAGE),
    [user],
  )
  const canCreateProduct = useMemo(
    () => hasPermission(user, PERMISSIONS.PRODUCTS_CREATE) || hasPermission(user, PERMISSIONS.PRODUCTS_MANAGE),
    [user],
  )
  const canUpdateProduct = useMemo(
    () => hasPermission(user, PERMISSIONS.PRODUCTS_UPDATE) || hasPermission(user, PERMISSIONS.PRODUCTS_MANAGE),
    [user],
  )

  const showNotification = (message, tone = 'success') => {
    setNotification({ message, tone })
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr))
    }, 4000)
  }

  const fetchProductsList = async () => {
    setIsLoading(true)
    setApiError(null)
    try {
      const res = await getProducts({ all: true })
      if (res?.ok && res.data?.success) {
        const fetched = res.data.data?.products || []
        setProducts(fetched)
      } else {
        // Fallback to initialProducts if backend offline
        setProducts(initialProducts)
      }
    } catch (err) {
      setProducts(initialProducts)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let isMounted = true

    if (canViewProducts) {
      fetchProductsList()

      getCategories({ all: true })
        .then((res) => {
          if (!isMounted) return
          if (res?.ok) {
            const list = res.data?.data?.categories || res.data?.categories
            if (Array.isArray(list) && list.length > 0) {
              setAvailableCategories(list)
            }
          }
        })
        .catch(() => {})

      getSuppliers({ all: true })
        .then((res) => {
          if (!isMounted) return
          if (res?.ok) {
            const list = res.data?.data?.suppliers || res.data?.suppliers
            if (Array.isArray(list) && list.length > 0) {
              setAvailableSuppliers(list)
            }
          }
        })
        .catch(() => {})
    } else {
      setIsLoading(false)
    }

    return () => {
      isMounted = false
    }
  }, [canViewProducts])

  const categoryFilterOptions = useMemo(() => {
    const apiNames = availableCategories.map((c) => c.name)
    const combined = Array.from(new Set([...apiNames, ...productCategories.filter((c) => c !== 'All Categories')]))
    return ['All Categories', ...combined]
  }, [availableCategories])

  const supplierFilterOptions = useMemo(() => {
    const apiNames = availableSuppliers.map((s) => s.name)
    return ['All Suppliers', ...apiNames]
  }, [availableSuppliers])

  const activeAdvancedFilterCount = useMemo(
    () => Object.values(advancedFilters).filter((value) => value !== '').length,
    [advancedFilters],
  )

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = [product.name, product.sku, product.barcode]
        .join(' ')
        .toLowerCase()
        .includes(search.trim().toLowerCase())

      const matchesCategory = categoryFilter === 'All Categories' || product.category === categoryFilter
      const matchesSupplier = supplierFilter === 'All Suppliers' || product.supplier === supplierFilter

      const matchesStock =
        stockFilter === 'All Stock Status' ||
        (stockFilter === 'In Stock' && (product.status === 'In Stock' || (product.status === 'Active' && product.stock > 0))) ||
        (stockFilter === 'Low Stock' && (product.status === 'Low Stock' || (product.stock > 0 && product.stock <= (product.reorderLevel || 5)))) ||
        (stockFilter === 'Out of Stock' && (product.status === 'Out of Stock' || product.stock === 0)) ||
        (stockFilter === 'Active' && (product.status === 'Active' || product.isActive)) ||
        (stockFilter === 'Inactive' && (product.status === 'Inactive' || product.isActive === false))

      const minPrice = advancedFilters.minPrice === '' ? null : Number(advancedFilters.minPrice)
      const maxPrice = advancedFilters.maxPrice === '' ? null : Number(advancedFilters.maxPrice)
      const taxRate = advancedFilters.taxRate === '' ? null : Number(advancedFilters.taxRate)
      const minStock = advancedFilters.minStock === '' ? null : Number(advancedFilters.minStock)
      const maxStock = advancedFilters.maxStock === '' ? null : Number(advancedFilters.maxStock)

      const matchesMinPrice = minPrice === null || Number(product.sellingPrice) >= minPrice
      const matchesMaxPrice = maxPrice === null || Number(product.sellingPrice) <= maxPrice
      const matchesTaxRate = taxRate === null || Number(product.taxRate) === taxRate
      const matchesMinStock = minStock === null || Number(product.stock) >= minStock
      const matchesMaxStock = maxStock === null || Number(product.stock) <= maxStock

      return (
        matchesSearch &&
        matchesCategory &&
        matchesSupplier &&
        matchesStock &&
        matchesMinPrice &&
        matchesMaxPrice &&
        matchesTaxRate &&
        matchesMinStock &&
        matchesMaxStock
      )
    })
  }, [products, search, categoryFilter, supplierFilter, stockFilter, advancedFilters])

  const totalProducts = products.length
  const activeProducts = products.filter((product) => product.status !== 'Inactive' && product.isActive !== false).length
  const lowStockCount = products.filter((product) => product.status === 'Low Stock' || (product.stock > 0 && product.stock <= (product.reorderLevel || 5))).length
  const outOfStockCount = products.filter((product) => product.status === 'Out of Stock' || product.stock === 0).length

  const openAddModal = () => {
    setEditingProduct(null)
    setFormExternalError(null)
    setIsFormOpen(true)
  }

  const closeFormModal = () => {
    setIsFormOpen(false)
    setEditingProduct(null)
    setFormExternalError(null)
  }

  const openEditModal = (product) => {
    setEditingProduct(product)
    setFormExternalError(null)
    setIsFormOpen(true)
  }

  const handleFormSubmit = async (productData) => {
    setIsSubmitting(true)
    setFormExternalError(null)

    try {
      if (editingProduct) {
        // Update product via PATCH /api/products/[id]
        const res = await updateProduct(editingProduct.id, productData)
        if (res?.ok && res.data?.success) {
          showNotification(`Product "${productData.name}" updated successfully.`)
          closeFormModal()
          fetchProductsList()
        } else {
          const errMsg = res?.data?.message || 'Failed to update product.'
          setFormExternalError(errMsg)
        }
      } else {
        // Create product via POST /api/products
        const res = await createProduct(productData)
        if (res?.ok && res.data?.success) {
          showNotification(`Product "${productData.name}" created successfully.`)
          closeFormModal()
          fetchProductsList()
        } else {
          const errMsg = res?.data?.message || 'Failed to create product.'
          setFormExternalError(errMsg)
        }
      }
    } catch (err) {
      setFormExternalError('Network or server error while saving product.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!statusTargetProduct) return
    const isCurrentlyActive = statusTargetProduct.status !== 'Inactive' && statusTargetProduct.isActive !== false
    const nextActive = !isCurrentlyActive

    try {
      const res = await updateProductStatus(statusTargetProduct.id, nextActive)
      if (res?.ok && res.data?.success) {
        showNotification(
          `Product "${statusTargetProduct.name}" ${nextActive ? 'activated' : 'deactivated'} successfully.`
        )
        setStatusTargetProduct(null)
        fetchProductsList()
      } else {
        showNotification(res?.data?.message || 'Failed to update product status.', 'danger')
      }
    } catch {
      showNotification('Failed to communicate with server.', 'danger')
    }
  }

  const handleViewDetails = async (product) => {
    try {
      const res = await getProductById(product.id)
      if (res?.ok && res.data?.success) {
        setViewingProduct(res.data.data)
      } else {
        setViewingProduct(product)
      }
    } catch {
      setViewingProduct(product)
    }
  }

  const getBadgeTone = (product) => {
    if (product.status === 'Inactive' || product.isActive === false) return 'neutral'
    if (product.status === 'Out of Stock' || product.stock === 0) return 'danger'
    if (product.status === 'Low Stock' || (product.stock > 0 && product.stock <= (product.reorderLevel || 5))) return 'warning'
    return 'success'
  }

  const getDisplayStatus = (product) => {
    if (product.status === 'Inactive' || product.isActive === false) return 'Inactive'
    if (product.stock === 0) return 'Out of Stock'
    if (product.stock > 0 && product.stock <= (product.reorderLevel || 5)) return 'Low Stock'
    return 'In Stock'
  }

  if (!canViewProducts) {
    return (
      <div className="products-page">
        <Card style={{ padding: '2rem', textAlign: 'center' }}>
          <h3>Access Restricted</h3>
          <p>You do not have permission to view products.</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="products-page">
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

      <header className="products-page__header">
        <div>
          <span className="section-label">Catalog Management</span>
          <h2>Products</h2>
          <p>Manage your product catalog, pricing, tax configuration, and stock information.</p>
        </div>

        <div className="products-page__actions">
          <Button variant="secondary" type="button" onClick={() => setIsImportModalOpen(true)}>
            Import Products
          </Button>
          {canCreateProduct && (
            <Button variant="primary" type="button" onClick={openAddModal}>
              + Add Product
            </Button>
          )}
        </div>
      </header>

      <section className="products-kpis">
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Products</span>
          <strong className="kpi-card__value small">{totalProducts}</strong>
        </Card>
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Active Products</span>
          <strong className="kpi-card__value small">{activeProducts}</strong>
        </Card>
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Low Stock</span>
          <strong className="kpi-card__value small">{lowStockCount}</strong>
        </Card>
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Out of Stock</span>
          <strong className="kpi-card__value small">{outOfStockCount}</strong>
        </Card>
      </section>

      <Card className="products-toolbar-card">
        <div className="products-toolbar">
          <div className="products-toolbar__search">
            <input
              type="text"
              placeholder="Search by product name, SKU, or barcode..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            {categoryFilterOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
            {supplierFilterOptions.map((supplier) => (
              <option key={supplier} value={supplier}>
                {supplier}
              </option>
            ))}
          </select>

          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
            {stockStatusOptions.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>

          <Button variant="secondary" type="button" onClick={() => setIsAdvancedFiltersOpen(true)}>
            {activeAdvancedFilterCount > 0 ? `More Filters • ${activeAdvancedFilterCount}` : 'More Filters'}
          </Button>
        </div>
      </Card>

      <Card className="products-table-card">
        <div className="products-table-wrap">
          <table className="products-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU / Item Code</th>
                <th>Barcode</th>
                <th>Category</th>
                <th>Supplier</th>
                <th>Selling Price</th>
                <th>Tax</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '2rem' }}>
                    Loading products...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '2rem' }}>
                    No products found matching the criteria.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const isItemActive = product.status !== 'Inactive' && product.isActive !== false
                  return (
                    <tr key={product.id}>
                      <td>
                        <div className="product-cell">
                          <div className="product-cell__dot" aria-hidden="true" />
                          <div>
                            <span>{product.name}</span>
                            {product.unitOfMeasure && (
                              <small style={{ display: 'block', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.75rem' }}>
                                Unit: {product.unitOfMeasure}
                              </small>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{product.sku}</td>
                      <td>{product.barcode || '—'}</td>
                      <td>{product.category || '—'}</td>
                      <td>{product.supplier || '—'}</td>
                      <td>{formatCurrency(product.sellingPrice)}</td>
                      <td>{product.taxRate}%</td>
                      <td>{product.stock}</td>
                      <td>
                        <Badge tone={getBadgeTone(product)}>{getDisplayStatus(product)}</Badge>
                      </td>
                      <td>
                        <div className="product-row-actions">
                          <button type="button" onClick={() => handleViewDetails(product)}>
                            View
                          </button>
                          {canUpdateProduct && (
                            <>
                              <button type="button" onClick={() => openEditModal(product)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className={isItemActive ? 'danger' : ''}
                                onClick={() => setStatusTargetProduct(product)}
                              >
                                {isItemActive ? 'Deactivate' : 'Activate'}
                              </button>
                            </>
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

      {/* Confirmation modal for Activate / Deactivate */}
      {statusTargetProduct && (
        <div className="modal-backdrop" onClick={() => setStatusTargetProduct(null)}>
          <div className="confirmation-modal" onClick={(event) => event.stopPropagation()}>
            <h3>
              {statusTargetProduct.status !== 'Inactive' && statusTargetProduct.isActive !== false
                ? 'Deactivate Product'
                : 'Activate Product'}
            </h3>
            <p>
              Are you sure you want to{' '}
              {statusTargetProduct.status !== 'Inactive' && statusTargetProduct.isActive !== false
                ? 'deactivate'
                : 'activate'}{' '}
              <strong>"{statusTargetProduct.name}"</strong>?
              {statusTargetProduct.status !== 'Inactive' && statusTargetProduct.isActive !== false
                ? ' Deactivated products will not be available for new sales in the POS register.'
                : ' Activated products will become available for sales.'}
            </p>
            <div className="confirmation-modal__actions">
              <Button variant="secondary" type="button" onClick={() => setStatusTargetProduct(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                className={statusTargetProduct.status !== 'Inactive' && statusTargetProduct.isActive !== false ? 'danger' : ''}
                onClick={handleToggleStatus}
              >
                Confirm{' '}
                {statusTargetProduct.status !== 'Inactive' && statusTargetProduct.isActive !== false
                  ? 'Deactivation'
                  : 'Activation'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ProductFormModal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        onSubmit={handleFormSubmit}
        mode={editingProduct ? 'edit' : 'add'}
        product={editingProduct}
        categoriesList={availableCategories}
        suppliersList={availableSuppliers}
        isSubmitting={isSubmitting}
        externalError={formExternalError}
      />

      <ProductDetailsModal product={viewingProduct} onClose={() => setViewingProduct(null)} />

      <ProductImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={(file) => {
          if (!file) return

          setProducts((currentProducts) => [
            {
              id: `prod-import-${Date.now()}`,
              name: 'Imported Product',
              sku: 'IMPORTED-01',
              barcode: 'IMPORT-CSV-001',
              category: 'Accessories',
              purchasePrice: 12.5,
              sellingPrice: 19.99,
              taxRate: 15,
              stock: 10,
              reorderLevel: 5,
              status: 'In Stock',
            },
            ...currentProducts,
          ])
          setIsImportModalOpen(false)
        }}
      />

      <ProductAdvancedFiltersModal
        isOpen={isAdvancedFiltersOpen}
        onClose={() => setIsAdvancedFiltersOpen(false)}
        currentFilters={advancedFilters}
        onApply={(nextFilters) => {
          setAdvancedFilters(nextFilters)
          setIsAdvancedFiltersOpen(false)
        }}
        onReset={() => {
          setAdvancedFilters({
            minPrice: '',
            maxPrice: '',
            taxRate: '',
            minStock: '',
            maxStock: '',
          })
        }}
      />
    </div>
  )
}

export default ProductsPage

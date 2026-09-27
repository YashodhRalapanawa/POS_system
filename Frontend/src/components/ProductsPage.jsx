import { useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import ProductFormModal from './ProductFormModal'
import ProductDetailsModal from './ProductDetailsModal'
import ProductImportModal from './ProductImportModal'
import ProductAdvancedFiltersModal from './ProductAdvancedFiltersModal'
import { initialProducts, productCategories, stockStatusOptions } from '../data/mockProducts'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function ProductsPage() {
  const [products, setProducts] = useState(initialProducts)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All Categories')
  const [stockFilter, setStockFilter] = useState('All Stock Status')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [viewingProduct, setViewingProduct] = useState(null)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false)
  const [advancedFilters, setAdvancedFilters] = useState({
    minPrice: '',
    maxPrice: '',
    taxRate: '',
    minStock: '',
    maxStock: '',
  })

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
      const matchesStock =
        stockFilter === 'All Stock Status' ||
        (stockFilter === 'In Stock' && product.status === 'In Stock') ||
        (stockFilter === 'Low Stock' && product.status === 'Low Stock') ||
        (stockFilter === 'Out of Stock' && product.status === 'Out of Stock') ||
        (stockFilter === 'Inactive' && product.status === 'Inactive')

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

      return matchesSearch && matchesCategory && matchesStock && matchesMinPrice && matchesMaxPrice && matchesTaxRate && matchesMinStock && matchesMaxStock
    })
  }, [products, search, categoryFilter, stockFilter, advancedFilters])

  const totalProducts = products.length
  const activeProducts = products.filter((product) => product.status !== 'Inactive').length
  const lowStockCount = products.filter((product) => product.status === 'Low Stock').length
  const outOfStockCount = products.filter((product) => product.status === 'Out of Stock').length

  const openAddModal = () => {
    setEditingProduct(null)
    setIsFormOpen(true)
  }

  const closeAddModal = () => {
    setIsFormOpen(false)
    setEditingProduct(null)
  }

  const openEditModal = (product) => {
    setEditingProduct(product)
    setIsFormOpen(true)
  }

  const updateProduct = (productId, updatedProduct) => {
    setProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.id === productId
          ? {
              ...product,
              ...updatedProduct,
              status:
                Number(updatedProduct.stock) === 0
                  ? 'Out of Stock'
                  : Number(updatedProduct.stock) <= Number(updatedProduct.reorderLevel)
                    ? 'Low Stock'
                    : 'In Stock',
            }
          : product,
      ),
    )
  }

  const addProduct = (newProduct) => {
    const normalizedProduct = {
      ...newProduct,
      id: `prod-${Date.now()}`,
      status:
        Number(newProduct.stock) === 0
          ? 'Out of Stock'
          : Number(newProduct.stock) <= Number(newProduct.reorderLevel)
            ? 'Low Stock'
            : 'In Stock',
    }

    setProducts((currentProducts) => [normalizedProduct, ...currentProducts])
    closeAddModal()
  }

  const removeProduct = () => {
    if (deleteTargetId === null) return

    setProducts((currentProducts) => currentProducts.filter((product) => product.id !== deleteTargetId))
    setDeleteTargetId(null)
  }

  const getBadgeTone = (status) => {
    switch (status) {
      case 'In Stock':
        return 'success'
      case 'Low Stock':
        return 'warning'
      case 'Out of Stock':
        return 'danger'
      default:
        return 'warning'
    }
  }

  return (
    <div className="products-page">
      <header className="products-page__header">
        <div>
          <span className="section-label">Catalog Management</span>
          <h2>Products</h2>
          <p>Manage your product catalog, pricing, tax configuration, and stock information.</p>
        </div>

        <div className="products-page__actions">
          <Button variant="secondary" type="button" onClick={() => setIsImportModalOpen(true)}>Import Products</Button>
          <Button variant="primary" type="button" onClick={openAddModal}>+ Add Product</Button>
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
            {productCategories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
            {stockStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
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
                <th>Selling Price</th>
                <th>Tax</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="product-cell">
                      <div className="product-cell__dot" aria-hidden="true" />
                      <span>{product.name}</span>
                    </div>
                  </td>
                  <td>{product.sku}</td>
                  <td>{product.barcode}</td>
                  <td>{product.category}</td>
                  <td>{formatCurrency(product.sellingPrice)}</td>
                  <td>{product.taxRate}%</td>
                  <td>{product.stock}</td>
                  <td>
                    <Badge tone={getBadgeTone(product.status)}>{product.status}</Badge>
                  </td>
                  <td>
                    <div className="product-row-actions">
                      <button type="button" onClick={() => setViewingProduct(product)}>View</button>
                      <button type="button" onClick={() => openEditModal(product)}>Edit</button>
                      <button type="button" className="danger" onClick={() => setDeleteTargetId(product.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {deleteTargetId && (
        <div className="modal-backdrop" onClick={() => setDeleteTargetId(null)}>
          <div className="confirmation-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Delete Product</h3>
            <p>Are you sure you want to delete this product from the catalog?</p>
            <div className="confirmation-modal__actions">
              <Button variant="secondary" type="button" onClick={() => setDeleteTargetId(null)}>Cancel</Button>
              <Button variant="primary" type="button" onClick={removeProduct}>Confirm Delete</Button>
            </div>
          </div>
        </div>
      )}

      <ProductFormModal
        isOpen={isFormOpen}
        onClose={closeAddModal}
        onSubmit={(productData) => {
          if (editingProduct) {
            updateProduct(editingProduct.id, productData)
          } else {
            addProduct(productData)
          }
          closeAddModal()
        }}
        mode={editingProduct ? 'edit' : 'add'}
        product={editingProduct}
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

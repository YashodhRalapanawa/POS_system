import { useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import CategoryFormModal from './CategoryFormModal'
import CategoryDetailsModal from './CategoryDetailsModal'
import { categoryStatusOptions, defaultUnassignedProducts, initialCategories } from '../data/mockCategories'

function formatDate(value) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function CategoriesPage() {
  const [categories, setCategories] = useState(initialCategories)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('add')
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [viewedCategoryId, setViewedCategoryId] = useState(null)

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [category.name, category.description].join(' ').toLowerCase().includes(searchText)

      const matchesStatus =
        statusFilter === 'All Status' ||
        category.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [categories, search, statusFilter])

  const totalCategories = categories.length
  const activeCategories = categories.filter((category) => category.status === 'Active').length
  const inactiveCategories = categories.filter((category) => category.status === 'Inactive').length

  const openAddModal = () => {
    setFormMode('add')
    setEditingCategoryId(null)
    setIsFormOpen(true)
  }

  const openEditModal = (category) => {
    setFormMode('edit')
    setEditingCategoryId(category.id)
    setIsFormOpen(true)
  }

  const closeFormModal = () => {
    setIsFormOpen(false)
    setFormMode('add')
    setEditingCategoryId(null)
  }

  const handleCategorySubmit = (formData) => {
    const now = new Date().toISOString()

    if (formMode === 'add') {
      const newCategory = {
        id: `cat-${Date.now()}`,
        name: formData.name,
        description: formData.description || 'Category description pending update.',
        productCount: 0,
        status: formData.status || 'Active',
        createdAt: now,
        updatedAt: now,
      }

      setCategories((currentCategories) => [newCategory, ...currentCategories])
      closeFormModal()
      return
    }

    setCategories((currentCategories) =>
      currentCategories.map((category) =>
        category.id === editingCategoryId
          ? {
              ...category,
              name: formData.name,
              description: formData.description || category.description,
              status: formData.status,
              updatedAt: now,
            }
          : category,
      ),
    )

    closeFormModal()
  }

  const toggleCategoryStatus = (categoryId) => {
    setCategories((currentCategories) =>
      currentCategories.map((category) => {
        if (category.id !== categoryId) return category

        return {
          ...category,
          status: category.status === 'Active' ? 'Inactive' : 'Active',
          updatedAt: new Date().toISOString(),
        }
      }),
    )
  }

  const viewedCategory = categories.find((category) => category.id === viewedCategoryId) ?? null
  const editingCategory = categories.find((category) => category.id === editingCategoryId) ?? null

  return (
    <div className="products-page categories-page">
      <header className="products-page__header categories-page__header">
        <div>
          <span className="section-label">Catalog Structure</span>
          <h2>Categories</h2>
          <p>Organize products into categories for easier catalog management and POS operations.</p>
        </div>

        <div className="products-page__actions">
          <Button variant="primary" type="button" onClick={openAddModal}>+ Add Category</Button>
        </div>
      </header>

      <section className="products-kpis categories-kpis">
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Categories</span>
          <strong className="kpi-card__value small">{totalCategories}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Active Categories</span>
          <strong className="kpi-card__value small">{activeCategories}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Inactive Categories</span>
          <strong className="kpi-card__value small">{inactiveCategories}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Unassigned Products</span>
          <strong className="kpi-card__value small">{defaultUnassignedProducts}</strong>
        </Card>
      </section>

      <Card className="products-toolbar-card">
        <div className="products-toolbar">
          <div className="products-toolbar__search">
            <input
              type="text"
              placeholder="Search categories..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {categoryStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <div />
        </div>
      </Card>

      <Card className="products-table-card">
        <div className="products-table-wrap">
          <table className="products-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Description</th>
                <th>Products</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredCategories.map((category) => (
                <tr key={category.id}>
                  <td>
                    <div className="product-cell">
                      <div className="product-cell__dot" aria-hidden="true" />
                      <span>{category.name}</span>
                    </div>
                  </td>
                  <td>{category.description}</td>
                  <td>{category.productCount}</td>
                  <td>
                    <Badge tone={category.status === 'Active' ? 'success' : 'warning'}>{category.status}</Badge>
                  </td>
                  <td>{formatDate(category.createdAt)}</td>
                  <td>{formatDate(category.updatedAt)}</td>
                  <td>
                    <div className="product-row-actions">
                      <button type="button" onClick={() => setViewedCategoryId(category.id)}>View</button>
                      <button type="button" onClick={() => openEditModal(category)}>Edit</button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => toggleCategoryStatus(category.id)}
                      >
                        {category.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <CategoryFormModal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        onSubmit={handleCategorySubmit}
        initialValues={editingCategory ? { name: editingCategory.name, description: editingCategory.description, status: editingCategory.status } : null}
        mode={formMode}
      />

      <CategoryDetailsModal category={viewedCategory} onClose={() => setViewedCategoryId(null)} />
    </div>
  )
}

export default CategoriesPage

import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import CategoryFormModal from './CategoryFormModal'
import CategoryDetailsModal from './CategoryDetailsModal'
import { categoryStatusOptions, defaultUnassignedProducts, initialCategories } from '../data/mockCategories'
import {
  getCategories,
  createCategory,
  updateCategory,
  updateCategoryStatus,
} from '../services/api'
import { PERMISSIONS, usePermission } from '../auth/permissions'

const CATEGORIES_STORAGE_KEY = 'vantrix.productCategories'

function loadInitialCategories() {
  try {
    const saved = localStorage.getItem(CATEGORIES_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {}
  return initialCategories
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function CategoriesPage() {
  const canViewCategories = usePermission(PERMISSIONS.CATEGORIES_VIEW) || usePermission(PERMISSIONS.CATEGORIES_MANAGE)
  const canCreateCategory = usePermission(PERMISSIONS.CATEGORIES_CREATE) || usePermission(PERMISSIONS.CATEGORIES_MANAGE)
  const canUpdateCategory = usePermission(PERMISSIONS.CATEGORIES_UPDATE) || usePermission(PERMISSIONS.CATEGORIES_MANAGE)

  const [categories, setCategories] = useState(loadInitialCategories)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [successAlert, setSuccessAlert] = useState(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('add')
  const [editingCategory, setEditingCategory] = useState(null)
  const [viewedCategoryId, setViewedCategoryId] = useState(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [statusConfirmTarget, setStatusConfirmTarget] = useState(null)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)

  // Fetch real categories from Supabase GET /api/categories on mount
  useEffect(() => {
    let isMounted = true

    async function fetchCategoriesList() {
      setLoading(true)
      setApiError(null)

      try {
        const res = await getCategories({ all: true })
        if (!isMounted) return

        if (res?.ok) {
          const list = res.data?.data?.categories || res.data?.categories
          if (Array.isArray(list)) {
            setCategories(list)
            try {
              localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(list))
            } catch {}
          }
        } else if (res && !res.ok) {
          if (res.status === 401) {
            setApiError('Session not authenticated. Displaying cached categories.')
          } else if (res.status === 403) {
            setApiError('Missing categories.view permission on server.')
          } else {
            setApiError(res.data?.message || 'Failed to fetch categories from server.')
          }
        }
      } catch {
        if (isMounted) {
          setApiError('Unable to connect to backend server. Using cached category data.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchCategoriesList()

    return () => {
      isMounted = false
    }
  }, [])

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [category.name, category.code, category.description]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchText)

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
    setEditingCategory(null)
    setFormError('')
    setIsFormOpen(true)
  }

  const openEditModal = (category) => {
    setFormMode('edit')
    setEditingCategory(category)
    setFormError('')
    setIsFormOpen(true)
  }

  const closeFormModal = () => {
    setIsFormOpen(false)
    setFormMode('add')
    setEditingCategory(null)
    setFormError('')
    setIsSubmitting(false)
  }

  const handleCategorySubmit = async (formData) => {
    setIsSubmitting(true)
    setFormError('')

    const payload = {
      name: formData.name,
      code: formData.code || undefined,
      description: formData.description || '',
      status: formData.status || 'Active',
      isActive: formData.status === 'Active',
    }

    try {
      if (formMode === 'add') {
        const res = await createCategory(payload)
        if (res?.ok && (res.data?.data?.category || res.data?.category)) {
          const newCategory = res.data?.data?.category || res.data?.category
          setCategories((current) => {
            const next = [newCategory, ...current.filter((c) => c.id !== newCategory.id)]
            try {
              localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(next))
            } catch {}
            return next
          })

          setSuccessAlert({
            title: 'Category Created Successfully!',
            message: `Category "${newCategory.name}" has been created.`,
          })

          closeFormModal()

          // Background re-sync
          getCategories({ all: true })
            .then((syncRes) => {
              if (syncRes?.ok) {
                const list = syncRes.data?.data?.categories || syncRes.data?.categories
                if (Array.isArray(list)) setCategories(list)
              }
            })
            .catch(() => {})
        } else {
          setFormError(res?.data?.message || res?.error || 'Failed to create category.')
        }
      } else if (formMode === 'edit' && editingCategory) {
        const res = await updateCategory(editingCategory.id, payload)
        if (res?.ok && (res.data?.data?.category || res.data?.category)) {
          const updatedCategory = res.data?.data?.category || res.data?.category
          setCategories((current) => {
            const next = current.map((c) => (c.id === editingCategory.id ? updatedCategory : c))
            try {
              localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(next))
            } catch {}
            return next
          })

          setSuccessAlert({
            title: 'Category Updated Successfully!',
            message: `Category "${updatedCategory.name}" has been updated.`,
          })

          closeFormModal()

          // Background re-sync
          getCategories({ all: true })
            .then((syncRes) => {
              if (syncRes?.ok) {
                const list = syncRes.data?.data?.categories || syncRes.data?.categories
                if (Array.isArray(list)) setCategories(list)
              }
            })
            .catch(() => {})
        } else {
          setFormError(res?.data?.message || res?.error || 'Failed to update category.')
        }
      }
    } catch (err) {
      setFormError(err.message || 'Error communicating with backend server.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openStatusConfirm = (category) => {
    setStatusConfirmTarget(category)
  }

  const closeStatusConfirm = () => {
    setStatusConfirmTarget(null)
  }

  const handleToggleStatus = async () => {
    if (!statusConfirmTarget || isTogglingStatus) return

    const newIsActive = statusConfirmTarget.status !== 'Active'
    const newStatus = newIsActive ? 'Active' : 'Inactive'

    setIsTogglingStatus(true)
    try {
      const res = await updateCategoryStatus(statusConfirmTarget.id, newIsActive)

      if (res?.ok) {
        setCategories((current) => {
          const next = current.map((c) =>
            c.id === statusConfirmTarget.id
              ? {
                  ...c,
                  status: newStatus,
                  isActive: newIsActive,
                  updatedAt: new Date().toISOString(),
                }
              : c
          )
          try {
            localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(next))
          } catch {}
          return next
        })

        setSuccessAlert({
          title: `Category ${newIsActive ? 'Activated' : 'Deactivated'} Successfully!`,
          message: `Category "${statusConfirmTarget.name}" is now ${newStatus}.`,
        })

        closeStatusConfirm()

        // Background re-sync
        getCategories({ all: true })
          .then((syncRes) => {
            if (syncRes?.ok) {
              const list = syncRes.data?.data?.categories || syncRes.data?.categories
              if (Array.isArray(list)) setCategories(list)
            }
          })
          .catch(() => {})
      } else {
        const errorMsg = res?.data?.message || res?.error || 'Failed to update category status.'
        setApiError(errorMsg)
        closeStatusConfirm()
      }
    } catch (err) {
      setApiError(err.message || 'Error communicating with backend server.')
      closeStatusConfirm()
    } finally {
      setIsTogglingStatus(false)
    }
  }

  const viewedCategory = categories.find((category) => category.id === viewedCategoryId) ?? null

  if (!canViewCategories) {
    return (
      <div className="products-page categories-page">
        <header className="products-page__header categories-page__header">
          <div>
            <span className="section-label">Catalog Structure</span>
            <h2>Categories</h2>
            <p>Organize products into categories for easier catalog management and POS operations.</p>
          </div>
        </header>

        <Card className="products-table-card">
          <div className="inventory-empty-state" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
            <strong style={{ fontSize: '1.2rem', color: '#ef4444', display: 'block', marginBottom: '0.5rem' }}>
              Access Denied
            </strong>
            <p style={{ color: '#6b7280' }}>
              You do not have the required <code>categories.view</code> permission to view product categories.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="products-page categories-page">
      <header className="products-page__header categories-page__header">
        <div>
          <span className="section-label">Catalog Structure</span>
          <h2>Categories</h2>
          <p>Organize products into categories for easier catalog management and POS operations.</p>
        </div>

        <div className="products-page__actions">
          {canCreateCategory ? (
            <Button variant="primary" type="button" onClick={openAddModal}>+ Add Category</Button>
          ) : (
            <Button
              variant="primary"
              type="button"
              disabled
              title="Requires categories.create permission"
              style={{ opacity: 0.55, cursor: 'not-allowed' }}
            >
              + Add Category
            </Button>
          )}
        </div>
      </header>

      {successAlert && (
        <div className="users-page__alert" style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#166534' }}>
          <div>
            <strong>{successAlert.title}</strong> {successAlert.message}
          </div>
          <button type="button" onClick={() => setSuccessAlert(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      {apiError && (
        <div className="users-page__alert" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>
          <div>
            <strong>Notice:</strong> {apiError}
          </div>
          <button type="button" onClick={() => setApiError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

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
              placeholder="Search categories by name, code..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {categoryStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              setSearch('')
              setStatusFilter('All Status')
            }}
          >
            Clear Filters
          </Button>
        </div>
      </Card>

      <Card className="products-table-card">
        <div className="products-table-wrap">
          <table className="products-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Code</th>
                <th>Description</th>
                <th>Products</th>
                <th>Status</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8">
                    <div className="inventory-empty-state" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                      <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Loading categories...</strong>
                      <span style={{ color: '#6b7280' }}>Fetching real category data from Supabase backend.</span>
                    </div>
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className="inventory-empty-state">
                      <strong>No categories found</strong>
                      <span>Try adjusting your search query or status filter.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCategories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <div className="product-cell">
                        <div className="product-cell__dot" aria-hidden="true" />
                        <strong>{category.name}</strong>
                      </div>
                    </td>
                    <td>
                      {category.code ? <code>{category.code}</code> : <span style={{ color: '#9ca3af' }}>—</span>}
                    </td>
                    <td>{category.description || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                    <td>{category.productCount ?? 0}</td>
                    <td>
                      <Badge tone={category.status === 'Active' ? 'success' : 'warning'}>{category.status}</Badge>
                    </td>
                    <td>{formatDate(category.createdAt)}</td>
                    <td>{formatDate(category.updatedAt)}</td>
                    <td>
                      <div className="product-row-actions">
                        <button type="button" onClick={() => setViewedCategoryId(category.id)}>View</button>
                        {canUpdateCategory ? (
                          <button type="button" onClick={() => openEditModal(category)}>Edit</button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            title="Requires categories.update permission"
                            style={{ opacity: 0.5, cursor: 'not-allowed' }}
                          >
                            Edit
                          </button>
                        )}
                        {canUpdateCategory ? (
                          <button
                            type="button"
                            className={category.status === 'Active' ? 'danger' : ''}
                            onClick={() => openStatusConfirm(category)}
                          >
                            {category.status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={category.status === 'Active' ? 'danger' : ''}
                            disabled
                            title="Requires categories.update permission"
                            style={{ opacity: 0.5, cursor: 'not-allowed' }}
                          >
                            {category.status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CategoryFormModal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        onSubmit={handleCategorySubmit}
        initialValues={editingCategory}
        mode={formMode}
        isSubmitting={isSubmitting}
        externalError={formError}
      />

      <CategoryDetailsModal category={viewedCategory} onClose={() => setViewedCategoryId(null)} />

      {statusConfirmTarget && (
        <div className="modal-backdrop" onClick={!isTogglingStatus ? closeStatusConfirm : undefined}>
          <div className="confirmation-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{statusConfirmTarget.status === 'Active' ? 'Deactivate Category' : 'Activate Category'}</h3>
            <p>
              {statusConfirmTarget.status === 'Active'
                ? `Are you sure you want to deactivate "${statusConfirmTarget.name}"? Inactive categories cannot be assigned to new products, but existing products will preserve this category.`
                : `Are you sure you want to activate "${statusConfirmTarget.name}"? It will become available for assignment to products.`}
            </p>
            <div className="confirmation-modal__actions">
              <Button variant="secondary" type="button" onClick={closeStatusConfirm} disabled={isTogglingStatus}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={handleToggleStatus}
                disabled={isTogglingStatus}
              >
                {isTogglingStatus
                  ? 'Processing...'
                  : statusConfirmTarget.status === 'Active'
                  ? 'Deactivate'
                  : 'Activate'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CategoriesPage

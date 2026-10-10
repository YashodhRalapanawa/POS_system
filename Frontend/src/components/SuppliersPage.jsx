import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import SupplierFormModal from './SupplierFormModal'
import SupplierDetailsModal from './SupplierDetailsModal'
import { initialSuppliers, supplierStatusOptions, supplierTypeOptions } from '../data/mockSuppliers'
import {
  getSuppliers,
  createSupplier,
  updateSupplier,
  updateSupplierStatus,
} from '../services/api'
import { PERMISSIONS, usePermission } from '../auth/permissions'

const SUPPLIERS_STORAGE_KEY = 'vantrix.suppliers'

function loadInitialSuppliers() {
  try {
    const saved = localStorage.getItem(SUPPLIERS_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {}
  return initialSuppliers
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

function SuppliersPage() {
  const canViewSuppliers = usePermission(PERMISSIONS.SUPPLIERS_VIEW) || usePermission(PERMISSIONS.SUPPLIERS_MANAGE)
  const canCreateSupplier = usePermission(PERMISSIONS.SUPPLIERS_CREATE) || usePermission(PERMISSIONS.SUPPLIERS_MANAGE)
  const canUpdateSupplier = usePermission(PERMISSIONS.SUPPLIERS_UPDATE) || usePermission(PERMISSIONS.SUPPLIERS_MANAGE)

  const [suppliers, setSuppliers] = useState(loadInitialSuppliers)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [successAlert, setSuccessAlert] = useState(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [typeFilter, setTypeFilter] = useState('All Types')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('add')
  const [editingSupplier, setEditingSupplier] = useState(null)
  const [viewedSupplierId, setViewedSupplierId] = useState(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [statusConfirmTarget, setStatusConfirmTarget] = useState(null)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)

  // Fetch real suppliers from Supabase GET /api/suppliers on mount
  useEffect(() => {
    let isMounted = true

    async function fetchSuppliersList() {
      setLoading(true)
      setApiError(null)

      try {
        const res = await getSuppliers({ all: true })
        if (!isMounted) return

        if (res?.ok) {
          const list = res.data?.data?.suppliers || res.data?.suppliers
          if (Array.isArray(list)) {
            setSuppliers(list)
            try {
              localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(list))
            } catch {}
          }
        } else if (res && !res.ok) {
          if (res.status === 401) {
            setApiError('Session not authenticated. Displaying cached supplier records.')
          } else if (res.status === 403) {
            setApiError('Missing suppliers.view permission on server.')
          } else {
            setApiError(res.data?.message || 'Failed to fetch suppliers from server.')
          }
        }
      } catch {
        if (isMounted) {
          setApiError('Unable to connect to backend server. Using cached supplier data.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchSuppliersList()

    return () => {
      isMounted = false
    }
  }, [])

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [supplier.name, supplier.code, supplier.contactPerson, supplier.email, supplier.phone]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchText)

      const matchesStatus = statusFilter === 'All Status' || supplier.status === statusFilter
      const matchesType = typeFilter === 'All Types' || supplier.supplierType === typeFilter

      return matchesSearch && matchesStatus && matchesType
    })
  }, [suppliers, search, statusFilter, typeFilter])

  const totalSuppliers = suppliers.length
  const activeSuppliers = suppliers.filter((supplier) => supplier.status === 'Active').length
  const inactiveSuppliers = suppliers.filter((supplier) => supplier.status === 'Inactive').length
  const productsSupplied = suppliers.reduce((total, supplier) => total + (supplier.productCount || 0), 0)

  const openAddModal = () => {
    setFormMode('add')
    setEditingSupplier(null)
    setFormError('')
    setIsFormOpen(true)
  }

  const openEditModal = (supplier) => {
    setFormMode('edit')
    setEditingSupplier(supplier)
    setFormError('')
    setIsFormOpen(true)
  }

  const closeFormModal = () => {
    setIsFormOpen(false)
    setFormMode('add')
    setEditingSupplier(null)
    setFormError('')
    setIsSubmitting(false)
  }

  const supplierCodeExists = (code, ignoredId = null) =>
    suppliers.some((s) => s.id !== ignoredId && s.code?.toLowerCase() === code.toLowerCase())

  const handleSupplierSubmit = async (formData) => {
    setIsSubmitting(true)
    setFormError('')

    const payload = {
      name: formData.name,
      code: formData.code,
      contactPerson: formData.contactPerson || '',
      email: formData.email || '',
      phone: formData.phone || '',
      supplierType: formData.supplierType || 'Local Supplier',
      address: formData.address || '',
      city: formData.city || '',
      country: formData.country || '',
      status: formData.status || 'Active',
      isActive: formData.status === 'Active',
    }

    try {
      if (formMode === 'add') {
        const res = await createSupplier(payload)
        if (res?.ok && (res.data?.data?.supplier || res.data?.supplier)) {
          const newSupplier = res.data?.data?.supplier || res.data?.supplier
          setSuppliers((current) => {
            const next = [newSupplier, ...current.filter((s) => s.id !== newSupplier.id)]
            try {
              localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(next))
            } catch {}
            return next
          })

          setSuccessAlert({
            title: 'Supplier Created Successfully!',
            message: `Supplier "${newSupplier.name}" (${newSupplier.code}) has been created.`,
          })

          closeFormModal()

          // Background re-sync
          getSuppliers({ all: true })
            .then((syncRes) => {
              if (syncRes?.ok) {
                const list = syncRes.data?.data?.suppliers || syncRes.data?.suppliers
                if (Array.isArray(list)) setSuppliers(list)
              }
            })
            .catch(() => {})
        } else {
          setFormError(res?.data?.message || res?.error || 'Failed to create supplier.')
        }
      } else if (formMode === 'edit' && editingSupplier) {
        const res = await updateSupplier(editingSupplier.id, payload)
        if (res?.ok && (res.data?.data?.supplier || res.data?.supplier)) {
          const updatedSupplier = res.data?.data?.supplier || res.data?.supplier
          setSuppliers((current) => {
            const next = current.map((s) => (s.id === editingSupplier.id ? updatedSupplier : s))
            try {
              localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(next))
            } catch {}
            return next
          })

          setSuccessAlert({
            title: 'Supplier Updated Successfully!',
            message: `Supplier "${updatedSupplier.name}" has been updated.`,
          })

          closeFormModal()

          // Background re-sync
          getSuppliers({ all: true })
            .then((syncRes) => {
              if (syncRes?.ok) {
                const list = syncRes.data?.data?.suppliers || syncRes.data?.suppliers
                if (Array.isArray(list)) setSuppliers(list)
              }
            })
            .catch(() => {})
        } else {
          setFormError(res?.data?.message || res?.error || 'Failed to update supplier.')
        }
      }
    } catch (err) {
      setFormError(err.message || 'Error communicating with backend server.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openStatusConfirm = (supplier) => {
    setStatusConfirmTarget(supplier)
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
      const res = await updateSupplierStatus(statusConfirmTarget.id, newIsActive)

      if (res?.ok) {
        setSuppliers((current) => {
          const next = current.map((s) =>
            s.id === statusConfirmTarget.id
              ? {
                  ...s,
                  status: newStatus,
                  isActive: newIsActive,
                  updatedAt: new Date().toISOString(),
                }
              : s
          )
          try {
            localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(next))
          } catch {}
          return next
        })

        setSuccessAlert({
          title: `Supplier ${newIsActive ? 'Activated' : 'Deactivated'} Successfully!`,
          message: `Supplier "${statusConfirmTarget.name}" is now ${newStatus}.`,
        })

        closeStatusConfirm()

        // Background re-sync
        getSuppliers({ all: true })
          .then((syncRes) => {
            if (syncRes?.ok) {
              const list = syncRes.data?.data?.suppliers || syncRes.data?.suppliers
              if (Array.isArray(list)) setSuppliers(list)
            }
          })
          .catch(() => {})
      } else {
        const errorMsg = res?.data?.message || res?.error || 'Failed to update supplier status.'
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

  const viewedSupplier = suppliers.find((supplier) => supplier.id === viewedSupplierId) ?? null

  if (!canViewSuppliers) {
    return (
      <div className="products-page suppliers-page">
        <header className="products-page__header suppliers-page__header">
          <div>
            <span className="section-label">SUPPLY CHAIN</span>
            <h2>Suppliers</h2>
            <p>Manage vendors and supplier relationships for your product catalog and inventory operations.</p>
          </div>
        </header>

        <Card className="products-table-card">
          <div className="inventory-empty-state" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
            <strong style={{ fontSize: '1.2rem', color: '#ef4444', display: 'block', marginBottom: '0.5rem' }}>
              Access Denied
            </strong>
            <p style={{ color: '#6b7280' }}>
              You do not have the required <code>suppliers.view</code> permission to view suppliers.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="products-page suppliers-page">
      <header className="products-page__header suppliers-page__header">
        <div>
          <span className="section-label">SUPPLY CHAIN</span>
          <h2>Suppliers</h2>
          <p>Manage vendors and supplier relationships for your product catalog and inventory operations.</p>
        </div>

        <div className="products-page__actions">
          {canCreateSupplier ? (
            <Button variant="primary" type="button" onClick={openAddModal}>+ Add Supplier</Button>
          ) : (
            <Button
              variant="primary"
              type="button"
              disabled
              title="Requires suppliers.create permission"
              style={{ opacity: 0.55, cursor: 'not-allowed' }}
            >
              + Add Supplier
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

      <section className="products-kpis suppliers-kpis">
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Suppliers</span>
          <strong className="kpi-card__value small">{totalSuppliers}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Active Suppliers</span>
          <strong className="kpi-card__value small">{activeSuppliers}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Inactive Suppliers</span>
          <strong className="kpi-card__value small">{inactiveSuppliers}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Products Supplied</span>
          <strong className="kpi-card__value small">{productsSupplied}</strong>
        </Card>
      </section>

      <Card className="products-toolbar-card suppliers-toolbar-card">
        <div className="products-toolbar suppliers-toolbar">
          <div className="products-toolbar__search">
            <input
              type="text"
              placeholder="Search suppliers by name, code, contact..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {supplierStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            {supplierTypeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              setSearch('')
              setStatusFilter('All Status')
              setTypeFilter('All Types')
            }}
          >
            Clear Filters
          </Button>
        </div>
      </Card>

      <Card className="products-table-card suppliers-table-card">
        <div className="products-table-wrap">
          <table className="products-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Supplier Code</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Products</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9">
                    <div className="inventory-empty-state" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                      <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Loading suppliers...</strong>
                      <span style={{ color: '#6b7280' }}>Fetching real supplier records from Supabase backend.</span>
                    </div>
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <div className="inventory-empty-state">
                      <strong>No suppliers found</strong>
                      <span>Try adjusting your search query or filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <div className="supplier-cell">
                        <div className="product-cell__dot" aria-hidden="true" />
                        <div>
                          <div className="supplier-cell__name">{supplier.name}</div>
                          <div className="supplier-cell__meta">{supplier.supplierType}</div>
                        </div>
                      </div>
                    </td>
                    <td className="supplier-code-cell">
                      <code>{supplier.code}</code>
                    </td>
                    <td>{supplier.contactPerson || '—'}</td>
                    <td className="supplier-phone-cell">{supplier.phone || '—'}</td>
                    <td className="supplier-email-cell">{supplier.email || '—'}</td>
                    <td className="supplier-product-count-cell">{supplier.productCount ?? 0}</td>
                    <td className="supplier-status-cell">
                      <Badge tone={supplier.status === 'Active' ? 'success' : 'warning'}>{supplier.status}</Badge>
                    </td>
                    <td className="supplier-updated-cell">{formatDate(supplier.updatedAt)}</td>
                    <td>
                      <div className="product-row-actions">
                        <button type="button" onClick={() => setViewedSupplierId(supplier.id)}>View</button>
                        {canUpdateSupplier ? (
                          <button type="button" onClick={() => openEditModal(supplier)}>Edit</button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            title="Requires suppliers.update permission"
                            style={{ opacity: 0.5, cursor: 'not-allowed' }}
                          >
                            Edit
                          </button>
                        )}
                        {canUpdateSupplier ? (
                          <button
                            type="button"
                            className={supplier.status === 'Active' ? 'danger' : ''}
                            onClick={() => openStatusConfirm(supplier)}
                          >
                            {supplier.status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={supplier.status === 'Active' ? 'danger' : ''}
                            disabled
                            title="Requires suppliers.update permission"
                            style={{ opacity: 0.5, cursor: 'not-allowed' }}
                          >
                            {supplier.status === 'Active' ? 'Deactivate' : 'Activate'}
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

      <SupplierFormModal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        onSubmit={handleSupplierSubmit}
        initialValues={editingSupplier}
        mode={formMode}
        codeConflictCheck={(candidateCode) => supplierCodeExists(candidateCode, editingSupplier?.id)}
        isSubmitting={isSubmitting}
        externalError={formError}
      />

      <SupplierDetailsModal supplier={viewedSupplier} onClose={() => setViewedSupplierId(null)} />

      {statusConfirmTarget && (
        <div className="modal-backdrop" onClick={!isTogglingStatus ? closeStatusConfirm : undefined}>
          <div className="confirmation-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{statusConfirmTarget.status === 'Active' ? 'Deactivate Supplier' : 'Activate Supplier'}</h3>
            <p>
              {statusConfirmTarget.status === 'Active'
                ? `Are you sure you want to deactivate "${statusConfirmTarget.name}"? Inactive suppliers cannot be selected for new product assignments, but existing product associations will remain visible.`
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

export default SuppliersPage

import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import CustomerFormModal from './CustomerFormModal'
import CustomerDetailsModal from './CustomerDetailsModal'
import { customerStatusOptions, customerTypeOptions, initialCustomers, MOCK_REPORTING_PERIOD_START } from '../data/mockCustomers'
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  updateCustomerStatus,
} from '../services/api'
import { PERMISSIONS, usePermission } from '../auth/permissions'

const CUSTOMERS_STORAGE_KEY = 'vantrix.customers'

function loadInitialCustomers() {
  try {
    const saved = localStorage.getItem(CUSTOMERS_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {}
  return initialCustomers
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

function CustomersPage() {
  const canViewCustomers = usePermission(PERMISSIONS.CUSTOMERS_VIEW) || usePermission(PERMISSIONS.CUSTOMERS_MANAGE)
  const canCreateCustomer = usePermission(PERMISSIONS.CUSTOMERS_CREATE) || usePermission(PERMISSIONS.CUSTOMERS_MANAGE)
  const canUpdateCustomer = usePermission(PERMISSIONS.CUSTOMERS_UPDATE) || usePermission(PERMISSIONS.CUSTOMERS_MANAGE)

  const [customers, setCustomers] = useState(loadInitialCustomers)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState(null)
  const [successAlert, setSuccessAlert] = useState(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [typeFilter, setTypeFilter] = useState('All Types')

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('add')
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [viewedCustomerId, setViewedCustomerId] = useState(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [statusConfirmTarget, setStatusConfirmTarget] = useState(null)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)

  // Fetch real customers from Supabase GET /api/customers on mount
  useEffect(() => {
    let isMounted = true

    async function fetchCustomersList() {
      setLoading(true)
      setApiError(null)

      try {
        const res = await getCustomers({ all: true })
        if (!isMounted) return

        if (res?.ok) {
          const list = res.data?.data?.customers || res.data?.customers
          if (Array.isArray(list)) {
            setCustomers(list)
            try {
              localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(list))
            } catch {}
          }
        } else if (res?.status === 401 || res?.status === 403) {
          setApiError(res.data?.message || 'Access denied: insufficient customer permissions.')
        } else {
          // If backend returned an error, fallback to local cache
          const msg = res?.data?.message || res?.error || 'Unable to load customers from server.'
          setApiError(msg)
        }
      } catch (err) {
        if (!isMounted) return
        setApiError(err.message || 'Network error while loading customers.')
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    if (canViewCustomers) {
      fetchCustomersList()
    } else {
      setLoading(false)
    }

    return () => {
      isMounted = false
    }
  }, [canViewCustomers])

  // Filter customers locally for instantaneous UX
  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [customer.name, customer.code, customer.phone, customer.email, customer.city]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(searchText)

      const matchesStatus = statusFilter === 'All Status' || customer.status === statusFilter
      const matchesType = typeFilter === 'All Types' || customer.customerType === typeFilter

      return matchesSearch && matchesStatus && matchesType
    })
  }, [customers, search, statusFilter, typeFilter])

  const totalCustomers = customers.length
  const activeCustomers = customers.filter((c) => c.status === 'Active' || c.isActive).length
  const inactiveCustomers = customers.filter((c) => c.status === 'Inactive' || c.isActive === false).length
  const newCustomers = customers.filter((c) => {
    if (!c.createdAt) return false
    return new Date(c.createdAt) >= new Date(MOCK_REPORTING_PERIOD_START)
  }).length

  const openAddModal = () => {
    setFormMode('add')
    setEditingCustomer(null)
    setFormError('')
    setIsFormOpen(true)
  }

  const openEditModal = (customer) => {
    setFormMode('edit')
    setEditingCustomer(customer)
    setFormError('')
    setIsFormOpen(true)
  }

  const closeFormModal = () => {
    setIsFormOpen(false)
    setFormMode('add')
    setEditingCustomer(null)
    setFormError('')
  }

  const handleCustomerSubmit = async (formData) => {
    setIsSubmitting(true)
    setFormError('')

    try {
      if (formMode === 'add') {
        const res = await createCustomer(formData)

        if (res?.ok && res.data?.success) {
          const newCust = res.data.data?.customer || res.data.customer || {
            ...formData,
            id: `cus-${Date.now()}`,
            orderCount: 0,
            status: formData.status || 'Active',
            isActive: (formData.status || 'Active') === 'Active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          setCustomers((current) => {
            const next = [newCust, ...current]
            try {
              localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(next))
            } catch {}
            return next
          })

          setSuccessAlert({
            title: 'Customer Created Successfully!',
            message: `"${newCust.name}" (${newCust.code}) has been saved to Supabase.`,
          })

          closeFormModal()

          // Re-sync with backend
          getCustomers({ all: true })
            .then((syncRes) => {
              if (syncRes?.ok) {
                const list = syncRes.data?.data?.customers || syncRes.data?.customers
                if (Array.isArray(list)) setCustomers(list)
              }
            })
            .catch(() => {})
        } else {
          const msg = res?.data?.message || res?.error || 'Failed to create customer profile.'
          setFormError(msg)
        }
      } else {
        // Edit mode
        const res = await updateCustomer(editingCustomer.id, formData)

        if (res?.ok && res.data?.success) {
          const updatedCust = res.data.data?.customer || res.data.customer || {
            ...editingCustomer,
            ...formData,
            updatedAt: new Date().toISOString(),
          }

          setCustomers((current) => {
            const next = current.map((c) => (c.id === editingCustomer.id ? updatedCust : c))
            try {
              localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(next))
            } catch {}
            return next
          })

          setSuccessAlert({
            title: 'Customer Updated Successfully!',
            message: `Profile for "${updatedCust.name}" has been updated in Supabase.`,
          })

          closeFormModal()

          // Re-sync with backend
          getCustomers({ all: true })
            .then((syncRes) => {
              if (syncRes?.ok) {
                const list = syncRes.data?.data?.customers || syncRes.data?.customers
                if (Array.isArray(list)) setCustomers(list)
              }
            })
            .catch(() => {})
        } else {
          const msg = res?.data?.message || res?.error || 'Failed to update customer profile.'
          setFormError(msg)
        }
      }
    } catch (err) {
      setFormError(err.message || 'Error communicating with server.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openStatusConfirm = (customer) => {
    setStatusConfirmTarget(customer)
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
      const res = await updateCustomerStatus(statusConfirmTarget.id, newIsActive)

      if (res?.ok) {
        setCustomers((current) => {
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
            localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(next))
          } catch {}
          return next
        })

        setSuccessAlert({
          title: `Customer ${newIsActive ? 'Activated' : 'Deactivated'} Successfully!`,
          message: `Customer "${statusConfirmTarget.name}" is now ${newStatus}.`,
        })

        closeStatusConfirm()

        // Background re-sync
        getCustomers({ all: true })
          .then((syncRes) => {
            if (syncRes?.ok) {
              const list = syncRes.data?.data?.customers || syncRes.data?.customers
              if (Array.isArray(list)) setCustomers(list)
            }
          })
          .catch(() => {})
      } else {
        const errorMsg = res?.data?.message || res?.error || 'Failed to update customer status.'
        setApiError(errorMsg)
        closeStatusConfirm()
      }
    } catch (err) {
      setApiError(err.message || 'Error communicating with server.')
      closeStatusConfirm()
    } finally {
      setIsTogglingStatus(false)
    }
  }

  const viewedCustomer = customers.find((c) => c.id === viewedCustomerId) ?? null

  if (!canViewCustomers) {
    return (
      <div className="products-page customers-page">
        <header className="products-page__header customers-page__header">
          <div>
            <span className="section-label">CUSTOMER MANAGEMENT</span>
            <h2>Customers</h2>
            <p>Manage customer profiles and contact information for POS sales and order history.</p>
          </div>
        </header>
        <Card className="products-table-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div className="inventory-empty-state">
            <strong style={{ color: 'var(--color-danger, #e53e3e)' }}>Access Restricted</strong>
            <p>You do not have permission to view customer profiles (<code>customers.view</code> required).</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="products-page customers-page">
      <header className="products-page__header customers-page__header">
        <div>
          <span className="section-label">CUSTOMER MANAGEMENT</span>
          <h2>Customers</h2>
          <p>Manage customer profiles and contact information for POS sales and order history.</p>
        </div>

        <div className="products-page__actions">
          {canCreateCustomer ? (
            <Button variant="primary" type="button" onClick={openAddModal}>
              + Add Customer
            </Button>
          ) : (
            <Button
              variant="primary"
              type="button"
              disabled
              title="Requires customers.create permission"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
            >
              + Add Customer
            </Button>
          )}
        </div>
      </header>

      {/* Notifications */}
      {successAlert && (
        <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
          <div className="alert-content">
            <strong>{successAlert.title}</strong>
            <p>{successAlert.message}</p>
          </div>
          <button type="button" className="alert-dismiss" onClick={() => setSuccessAlert(null)}>
            ×
          </button>
        </div>
      )}

      {apiError && (
        <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
          <div className="alert-content">
            <strong>Server Error:</strong>
            <p>{apiError}</p>
          </div>
          <button type="button" className="alert-dismiss" onClick={() => setApiError(null)}>
            ×
          </button>
        </div>
      )}

      <section className="products-kpis customers-kpis">
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Customers</span>
          <strong className="kpi-card__value small">{totalCustomers}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Active Customers</span>
          <strong className="kpi-card__value small">{activeCustomers}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Inactive Customers</span>
          <strong className="kpi-card__value small">{inactiveCustomers}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">New Customers</span>
          <strong className="kpi-card__value small">{newCustomers}</strong>
        </Card>
      </section>

      <Card className="products-toolbar-card customers-toolbar-card">
        <div className="products-toolbar customers-toolbar">
          <div className="products-toolbar__search">
            <input
              type="text"
              placeholder="Search by name, code, phone, email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {customerStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            {customerTypeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="products-table-card customers-table-card">
        <div className="products-table-wrap">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted, #718096)' }}>
              Loading customers from Supabase...
            </div>
          ) : (
            <table className="products-table customers-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Customer Code</th>
                  <th>Type</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>City</th>
                  <th>Orders</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan="10">
                      <div className="inventory-empty-state">
                        <strong>No customers found</strong>
                        <span>Try adjusting your search query or filters.</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <div className="customer-cell">
                          <div className="product-cell__dot" aria-hidden="true" />
                          <div>
                            <div className="customer-cell__name">
                              {customer.name}
                              {customer.isWalkIn && (
                                <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--color-primary, #3182ce)' }}>
                                  (Walk-in)
                                </span>
                              )}
                            </div>
                            <div className="customer-cell__meta">
                              {customer.isWalkIn ? 'Default Walk-in Account' : (customer.email || customer.city || 'No email')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="customer-code-cell">{customer.code}</td>
                      <td>{customer.customerType || 'Individual'}</td>
                      <td className="customer-phone-cell">{customer.phone || '—'}</td>
                      <td className="customer-email-cell">{customer.email || '—'}</td>
                      <td>{customer.city || '—'}</td>
                      <td className="customer-order-cell">{customer.orderCount ?? 0}</td>
                      <td className="customer-status-cell">
                        <Badge tone={customer.status === 'Active' ? 'success' : 'warning'}>
                          {customer.status}
                        </Badge>
                      </td>
                      <td className="customer-updated-cell">{formatDate(customer.updatedAt)}</td>
                      <td>
                        <div className="product-row-actions customer-row-actions">
                          <button type="button" onClick={() => setViewedCustomerId(customer.id)}>
                            View
                          </button>

                          {canUpdateCustomer ? (
                            <button type="button" onClick={() => openEditModal(customer)}>
                              Edit
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              title="Requires customers.update permission"
                              style={{ opacity: 0.5, cursor: 'not-allowed' }}
                            >
                              Edit
                            </button>
                          )}

                          {!customer.isWalkIn && (
                            canUpdateCustomer ? (
                              <button
                                type="button"
                                className={customer.status === 'Active' ? 'danger' : ''}
                                onClick={() => openStatusConfirm(customer)}
                              >
                                {customer.status === 'Active' ? 'Deactivate' : 'Activate'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={customer.status === 'Active' ? 'danger' : ''}
                                disabled
                                title="Requires customers.update permission"
                                style={{ opacity: 0.5, cursor: 'not-allowed' }}
                              >
                                {customer.status === 'Active' ? 'Deactivate' : 'Activate'}
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <CustomerFormModal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        onSubmit={handleCustomerSubmit}
        initialValues={editingCustomer}
        mode={formMode}
        isSubmitting={isSubmitting}
        serverError={formError}
      />

      <CustomerDetailsModal customer={viewedCustomer} onClose={() => setViewedCustomerId(null)} />

      {/* Confirmation Modal for Customer Status Change */}
      {statusConfirmTarget && (
        <div className="modal-backdrop" onClick={!isTogglingStatus ? closeStatusConfirm : undefined}>
          <div className="confirmation-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{statusConfirmTarget.status === 'Active' ? 'Deactivate Customer' : 'Activate Customer'}</h3>
            <p>
              {statusConfirmTarget.status === 'Active'
                ? `Are you sure you want to deactivate "${statusConfirmTarget.name}"? Inactive customers cannot be selected for new POS sales, but historical customer orders and records will remain visible.`
                : `Are you sure you want to activate "${statusConfirmTarget.name}"? This customer will be immediately available for selection in POS sales.`}
            </p>
            <div className="confirmation-modal__actions">
              <Button variant="secondary" type="button" onClick={closeStatusConfirm} disabled={isTogglingStatus}>
                Cancel
              </Button>
              <Button
                variant={statusConfirmTarget.status === 'Active' ? 'danger' : 'primary'}
                type="button"
                onClick={handleToggleStatus}
                disabled={isTogglingStatus}
              >
                {isTogglingStatus ? 'Updating...' : (statusConfirmTarget.status === 'Active' ? 'Deactivate' : 'Activate')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CustomersPage

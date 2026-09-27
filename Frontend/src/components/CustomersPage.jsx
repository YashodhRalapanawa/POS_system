import { useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import CustomerFormModal from './CustomerFormModal'
import CustomerDetailsModal from './CustomerDetailsModal'
import { customerStatusOptions, customerTypeOptions, initialCustomers, MOCK_REPORTING_PERIOD_START } from '../data/mockCustomers'

function formatDate(value) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function CustomersPage() {
  const [customers, setCustomers] = useState(initialCustomers)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [typeFilter, setTypeFilter] = useState('All Types')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('add')
  const [editingCustomerId, setEditingCustomerId] = useState(null)
  const [viewedCustomerId, setViewedCustomerId] = useState(null)

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [customer.name, customer.code, customer.phone, customer.email]
          .join(' ')
          .toLowerCase()
          .includes(searchText)

      const matchesStatus = statusFilter === 'All Status' || customer.status === statusFilter
      const matchesType = typeFilter === 'All Types' || customer.customerType === typeFilter

      return matchesSearch && matchesStatus && matchesType
    })
  }, [customers, search, statusFilter, typeFilter])

  const totalCustomers = customers.length
  const activeCustomers = customers.filter((customer) => customer.status === 'Active').length
  const inactiveCustomers = customers.filter((customer) => customer.status === 'Inactive').length
  const newCustomers = customers.filter((customer) => new Date(customer.createdAt) >= new Date(MOCK_REPORTING_PERIOD_START)).length

  const openAddModal = () => {
    setFormMode('add')
    setEditingCustomerId(null)
    setIsFormOpen(true)
  }

  const openEditModal = (customer) => {
    setFormMode('edit')
    setEditingCustomerId(customer.id)
    setIsFormOpen(true)
  }

  const closeFormModal = () => {
    setIsFormOpen(false)
    setFormMode('add')
    setEditingCustomerId(null)
  }

  const customerCodeExists = (code, ignoredId = null) =>
    customers.some(
      (customer) => customer.id !== ignoredId && customer.code.toLowerCase() === code.toLowerCase(),
    )

  const handleCustomerSubmit = (formData) => {
    const now = new Date().toISOString()

    if (formMode === 'add') {
      const newCustomer = {
        ...formData,
        id: `cus-${Date.now()}`,
        orderCount: 0,
        status: formData.status || 'Active',
        customerType: formData.customerType || 'Individual',
        createdAt: now,
        updatedAt: now,
      }

      setCustomers((currentCustomers) => [newCustomer, ...currentCustomers])
      closeFormModal()
      return
    }

    setCustomers((currentCustomers) =>
      currentCustomers.map((customer) =>
        customer.id === editingCustomerId
          ? {
              ...customer,
              ...formData,
              updatedAt: now,
            }
          : customer,
      ),
    )

    closeFormModal()
  }

  const toggleCustomerStatus = (customerId) => {
    setCustomers((currentCustomers) =>
      currentCustomers.map((customer) => {
        if (customer.id !== customerId) return customer

        return {
          ...customer,
          status: customer.status === 'Active' ? 'Inactive' : 'Active',
          updatedAt: new Date().toISOString(),
        }
      }),
    )
  }

  const editingCustomer = customers.find((customer) => customer.id === editingCustomerId) ?? null
  const viewedCustomer = customers.find((customer) => customer.id === viewedCustomerId) ?? null

  return (
    <div className="products-page customers-page">
      <header className="products-page__header customers-page__header">
        <div>
          <span className="section-label">CUSTOMER MANAGEMENT</span>
          <h2>Customers</h2>
          <p>Manage customer profiles and contact information for POS sales and order history.</p>
        </div>

        <div className="products-page__actions">
          <Button variant="primary" type="button" onClick={openAddModal}>+ Add Customer</Button>
        </div>
      </header>

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
              placeholder="Search customers..."
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
                      <span>Try adjusting your search or filters.</span>
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
                          <div className="customer-cell__name">{customer.name}</div>
                          <div className="customer-cell__meta">{customer.email || 'Walk-in account'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="customer-code-cell">{customer.code}</td>
                    <td>{customer.customerType}</td>
                    <td className="customer-phone-cell">{customer.phone || '—'}</td>
                    <td className="customer-email-cell">{customer.email || '—'}</td>
                    <td>{customer.city}</td>
                    <td className="customer-order-cell">{customer.orderCount}</td>
                    <td className="customer-status-cell">
                      <Badge tone={customer.status === 'Active' ? 'success' : 'warning'}>{customer.status}</Badge>
                    </td>
                    <td className="customer-updated-cell">{formatDate(customer.updatedAt)}</td>
                    <td>
                      <div className="product-row-actions customer-row-actions">
                        <button type="button" onClick={() => setViewedCustomerId(customer.id)}>View</button>
                        <button type="button" onClick={() => openEditModal(customer)}>Edit</button>
                        {!customer.isWalkIn && (
                          <button
                            type="button"
                            className="danger"
                            onClick={() => toggleCustomerStatus(customer.id)}
                          >
                            {customer.status === 'Active' ? 'Deactivate' : 'Activate'}
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

      <CustomerFormModal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        onSubmit={handleCustomerSubmit}
        initialValues={
          editingCustomer
            ? {
                name: editingCustomer.name,
                code: editingCustomer.code,
                customerType: editingCustomer.customerType,
                phone: editingCustomer.phone,
                email: editingCustomer.email,
                address: editingCustomer.address,
                city: editingCustomer.city,
                country: editingCustomer.country,
                status: editingCustomer.status,
              }
            : null
        }
        mode={formMode}
        codeConflictCheck={(candidateCode) => customerCodeExists(candidateCode, editingCustomerId)}
      />

      <CustomerDetailsModal customer={viewedCustomer} onClose={() => setViewedCustomerId(null)} />
    </div>
  )
}

export default CustomersPage

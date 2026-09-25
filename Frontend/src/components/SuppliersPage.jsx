import { useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import SupplierFormModal from './SupplierFormModal'
import SupplierDetailsModal from './SupplierDetailsModal'
import { initialSuppliers, supplierStatusOptions, supplierTypeOptions } from '../data/mockSuppliers'

function formatDate(value) {
  const date = new Date(value)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function SuppliersPage() {
  const [suppliers, setSuppliers] = useState(initialSuppliers)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [typeFilter, setTypeFilter] = useState('All Types')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formMode, setFormMode] = useState('add')
  const [editingSupplierId, setEditingSupplierId] = useState(null)
  const [viewedSupplierId, setViewedSupplierId] = useState(null)

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [supplier.name, supplier.code, supplier.contactPerson, supplier.email]
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
  const productsSupplied = suppliers.reduce((total, supplier) => total + supplier.productCount, 0)

  const openAddModal = () => {
    setFormMode('add')
    setEditingSupplierId(null)
    setIsFormOpen(true)
  }

  const openEditModal = (supplier) => {
    setFormMode('edit')
    setEditingSupplierId(supplier.id)
    setIsFormOpen(true)
  }

  const closeFormModal = () => {
    setIsFormOpen(false)
    setFormMode('add')
    setEditingSupplierId(null)
  }

  const supplierCodeExists = (code, ignoredId = null) =>
    suppliers.some((supplier) => supplier.id !== ignoredId && supplier.code.toLowerCase() === code.toLowerCase())

  const handleSupplierSubmit = (formData) => {
    const now = new Date().toISOString()

    if (formMode === 'add') {
      const newSupplier = {
        ...formData,
        id: `sup-${Date.now()}`,
        productCount: 0,
        createdAt: now,
        updatedAt: now,
      }

      setSuppliers((currentSuppliers) => [newSupplier, ...currentSuppliers])
      closeFormModal()
      return
    }

    setSuppliers((currentSuppliers) =>
      currentSuppliers.map((supplier) =>
        supplier.id === editingSupplierId
          ? {
              ...supplier,
              ...formData,
              updatedAt: now,
            }
          : supplier,
      ),
    )

    closeFormModal()
  }

  const toggleSupplierStatus = (supplierId) => {
    setSuppliers((currentSuppliers) =>
      currentSuppliers.map((supplier) => {
        if (supplier.id !== supplierId) return supplier

        return {
          ...supplier,
          status: supplier.status === 'Active' ? 'Inactive' : 'Active',
          updatedAt: new Date().toISOString(),
        }
      }),
    )
  }

  const viewedSupplier = suppliers.find((supplier) => supplier.id === viewedSupplierId) ?? null
  const editingSupplier = suppliers.find((supplier) => supplier.id === editingSupplierId) ?? null

  return (
    <div className="products-page suppliers-page">
      <header className="products-page__header suppliers-page__header">
        <div>
          <span className="section-label">SUPPLY CHAIN</span>
          <h2>Suppliers</h2>
          <p>Manage vendors and supplier relationships for your product catalog and inventory operations.</p>
        </div>

        <div className="products-page__actions">
          <Button variant="primary" type="button" onClick={openAddModal}>+ Add Supplier</Button>
        </div>
      </header>

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
              placeholder="Search suppliers..."
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
              {filteredSuppliers.map((supplier) => (
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
                  <td className="supplier-code-cell">{supplier.code}</td>
                  <td>{supplier.contactPerson}</td>
                  <td className="supplier-phone-cell">{supplier.phone}</td>
                  <td className="supplier-email-cell">{supplier.email}</td>
                  <td className="supplier-product-count-cell">{supplier.productCount}</td>
                  <td className="supplier-status-cell">
                    <Badge tone={supplier.status === 'Active' ? 'success' : 'warning'}>{supplier.status}</Badge>
                  </td>
                  <td className="supplier-updated-cell">{formatDate(supplier.updatedAt)}</td>
                  <td>
                    <div className="product-row-actions">
                      <button type="button" onClick={() => setViewedSupplierId(supplier.id)}>View</button>
                      <button type="button" onClick={() => openEditModal(supplier)}>Edit</button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => toggleSupplierStatus(supplier.id)}
                      >
                        {supplier.status === 'Active' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SupplierFormModal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        onSubmit={handleSupplierSubmit}
        initialValues={
          editingSupplier
            ? {
                name: editingSupplier.name,
                code: editingSupplier.code,
                contactPerson: editingSupplier.contactPerson,
                phone: editingSupplier.phone,
                email: editingSupplier.email,
                supplierType: editingSupplier.supplierType,
                address: editingSupplier.address,
                city: editingSupplier.city,
                country: editingSupplier.country,
                status: editingSupplier.status,
              }
            : null
        }
        mode={formMode}
        codeConflictCheck={(candidateCode) => supplierCodeExists(candidateCode, editingSupplierId)}
      />

      <SupplierDetailsModal supplier={viewedSupplier} onClose={() => setViewedSupplierId(null)} />
    </div>
  )
}

export default SuppliersPage

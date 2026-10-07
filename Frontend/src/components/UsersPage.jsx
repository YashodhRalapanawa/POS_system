import { useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import UserDetailsModal from './UserDetailsModal'
import UserFormModal from './UserFormModal'
import RoleFormModal from './RoleFormModal'
import { mockUsers, userRoles, usersStatusOptions, usersRegisterOptions } from '../data/mockUsers'

function formatDate(value) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDateTime(value) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function getInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function UsersPage() {
  const [users, setUsers] = useState(mockUsers)
  const [customRoles, setCustomRoles] = useState(userRoles)
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false)
  const [roleAlert, setRoleAlert] = useState(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All Roles')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [registerFilter, setRegisterFilter] = useState('All Registers')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [viewingUser, setViewingUser] = useState(null)
  const [statusTarget, setStatusTarget] = useState(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const handleRoleCreated = (newRole) => {
    const roleName = typeof newRole === 'string' ? newRole : newRole.name
    if (roleName && !customRoles.includes(roleName)) {
      setCustomRoles((prev) => [...prev, roleName])
    }
    setRoleAlert({
      title: 'Role Created Successfully!',
      message: `Role "${roleName}" is now registered and available for staff user assignment.`,
    })
  }

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [user.name, user.email, user.employeeId].join(' ').toLowerCase().includes(searchText)

      const matchesRole = roleFilter === 'All Roles' || user.role === roleFilter
      const matchesStatus = statusFilter === 'All Status' || user.status === statusFilter
      const matchesRegister =
        registerFilter === 'All Registers' ||
        user.registerAccess === registerFilter ||
        (registerFilter === 'None' && user.registerAccess === 'None')

      return matchesSearch && matchesRole && matchesStatus && matchesRegister
    })
  }, [users, search, roleFilter, statusFilter, registerFilter])

  const totalUsers = users.length
  const activeUsers = users.filter((user) => user.status === 'Active').length
  const managerCount = users.filter((user) => user.role === 'Manager').length
  const cashierCount = users.filter((user) => user.role === 'Cashier').length

  const openAddModal = () => {
    setEditingUser(null)
    setIsFormOpen(true)
  }

  const openEditModal = (user) => {
    setEditingUser(user)
    setIsFormOpen(true)
  }

  const closeFormModal = () => {
    setIsFormOpen(false)
    setEditingUser(null)
  }

  const handleUserSubmit = (formData) => {
    const now = new Date().toISOString()

    if (editingUser) {
      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === editingUser.id
            ? {
                ...user,
                ...formData,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt,
              }
            : user,
        ),
      )
      closeFormModal()
      return
    }

    const newUser = {
      ...formData,
      id: `USR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      lastLogin: now,
      createdAt: now,
    }

    setUsers((currentUsers) => [newUser, ...currentUsers])
    closeFormModal()
  }

  const openStatusConfirm = (userId) => {
    setStatusTarget(userId)
    setIsConfirmOpen(true)
  }

  const closeStatusConfirm = () => {
    setStatusTarget(null)
    setIsConfirmOpen(false)
  }

  const handleToggleStatus = () => {
    if (!statusTarget) return

    setUsers((currentUsers) =>
      currentUsers.map((user) =>
        user.id === statusTarget
          ? {
              ...user,
              status: user.status === 'Active' ? 'Inactive' : 'Active',
            }
          : user,
      ),
    )

    closeStatusConfirm()
  }

  const handleExportUsers = () => {
    const rows = [
      ['Name', 'Email', 'Employee ID', 'Role', 'Register Access', 'Last Login', 'Status', 'Created Date'],
      ...users.map((user) => [
        user.name,
        user.email,
        user.employeeId,
        user.role,
        user.registerAccess,
        user.lastLogin ? new Date(user.lastLogin).toISOString() : '',
        user.status,
        user.createdAt ? new Date(user.createdAt).toISOString() : '',
      ]),
    ]

    const csvContent = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `vantrix-users-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const statusTargetUser = users.find((user) => user.id === statusTarget) ?? null

  return (
    <div className="products-page users-page">
      <header className="products-page__header users-page__header">
        <div>
          <span className="section-label">Staff Management</span>
          <h2>Users</h2>
          <p>Manage staff accounts, roles, register access, and account status.</p>
        </div>

        <div className="products-page__actions">
          <Button variant="secondary" type="button" onClick={handleExportUsers}>Export Users</Button>
          <Button variant="secondary" type="button" onClick={() => setIsRoleModalOpen(true)}>+ Add Role</Button>
          <Button variant="primary" type="button" onClick={openAddModal}>+ Add User</Button>
        </div>
      </header>

      {roleAlert && (
        <div className="users-page__alert">
          <div>
            <strong>{roleAlert.title}</strong> {roleAlert.message}
          </div>
          <button type="button" onClick={() => setRoleAlert(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <section className="products-kpis users-kpis">
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Users</span>
          <strong className="kpi-card__value small">{totalUsers}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Active Users</span>
          <strong className="kpi-card__value small">{activeUsers}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Managers</span>
          <strong className="kpi-card__value small">{managerCount}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Cashiers</span>
          <strong className="kpi-card__value small">{cashierCount}</strong>
        </Card>
      </section>

      <Card className="products-toolbar-card users-toolbar-card">
        <div className="users-toolbar">
          <div className="products-toolbar__search">
            <input
              type="text"
              placeholder="Search by name, email, employee ID..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            {['All Roles', ...customRoles].map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {usersStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <select value={registerFilter} onChange={(event) => setRegisterFilter(event.target.value)}>
            {usersRegisterOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>

          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              setSearch('')
              setRoleFilter('All Roles')
              setStatusFilter('All Status')
              setRegisterFilter('All Registers')
            }}
          >
            Clear Filters
          </Button>
        </div>
      </Card>

      <Card className="products-table-card users-table-card">
        <div className="products-table-wrap">
          <table className="products-table users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Employee ID</th>
                <th>Role</th>
                <th>Register Access</th>
                <th>Last Login</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7">
                    <div className="inventory-empty-state">
                      <strong>No users found</strong>
                      <span>Try adjusting your search or filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar" aria-hidden="true">{getInitials(user.name)}</div>
                        <div>
                          <div className="user-cell__name">{user.name}</div>
                          <div className="user-cell__meta">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>{user.employeeId}</td>
                    <td>
                      <Badge tone={user.role === 'Administrator' ? 'success' : user.role === 'Manager' ? 'warning' : user.role === 'Cashier' ? 'info' : user.role === 'Inventory Clerk' ? 'default' : 'warning'}>{user.role}</Badge>
                    </td>
                    <td>{user.registerAccess}</td>
                    <td>{formatDateTime(user.lastLogin)}</td>
                    <td>
                      <Badge tone={user.status === 'Active' ? 'success' : 'warning'}>{user.status}</Badge>
                    </td>
                    <td>
                      <div className="product-row-actions users-actions">
                        <button type="button" onClick={() => setViewingUser(user)}>View</button>
                        <button type="button" onClick={() => openEditModal(user)}>Edit</button>
                        <button type="button" className="danger" onClick={() => openStatusConfirm(user.id)}>
                          {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <UserFormModal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        onSubmit={handleUserSubmit}
        initialValues={editingUser}
        mode={editingUser ? 'edit' : 'add'}
        existingUsers={users}
        roleOptions={customRoles}
      />

      <RoleFormModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        onSuccess={handleRoleCreated}
        existingRoles={customRoles}
      />

      <UserDetailsModal user={viewingUser} onClose={() => setViewingUser(null)} />

      {isConfirmOpen && (
        <div className="modal-backdrop" onClick={closeStatusConfirm}>
          <div className="confirmation-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{statusTargetUser?.status === 'Active' ? 'Deactivate User' : 'Activate User'}</h3>
            <p>
              {statusTargetUser?.status === 'Active'
                ? 'Are you sure you want to deactivate this user?'
                : 'Are you sure you want to activate this user?'}
            </p>
            <div className="confirmation-modal__actions">
              <Button variant="secondary" type="button" onClick={closeStatusConfirm}>Cancel</Button>
              <Button variant="primary" type="button" onClick={handleToggleStatus}>
                {statusTargetUser?.status === 'Active' ? 'Deactivate User' : 'Activate User'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UsersPage

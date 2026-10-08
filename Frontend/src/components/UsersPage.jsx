import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import UserDetailsModal from './UserDetailsModal'
import UserFormModal from './UserFormModal'
import RoleFormModal from './RoleFormModal'
import { mockUsers, userRoles, usersStatusOptions, usersRegisterOptions } from '../data/mockUsers'
import {
  getUsers,
  getRoles,
  updateStaffRole,
  createStaffUser,
  updateStaffUser,
  updateStaffStatus,
} from '../services/api'
import { PERMISSIONS, usePermission } from '../auth/permissions'

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

const USERS_STORAGE_KEY = 'vantrix.staffUsers'

function loadInitialUsers() {
  try {
    const saved = localStorage.getItem(USERS_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Ensure all default mockUsers are always kept, with added users on top
        const parsedIds = new Set(parsed.map((u) => u.id))
        const missingMocks = mockUsers.filter((m) => !parsedIds.has(m.id))
        return [...parsed, ...missingMocks]
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  return mockUsers
}

function UsersPage() {
  const canViewUsers = usePermission(PERMISSIONS.USERS_VIEW)
  const canCreateStaff = usePermission(PERMISSIONS.USERS_CREATE) || usePermission(PERMISSIONS.USERS_MANAGE)
  const canUpdateStaff = usePermission(PERMISSIONS.USERS_UPDATE) || usePermission(PERMISSIONS.USERS_MANAGE)
  const canAssignRole = usePermission(PERMISSIONS.USERS_ASSIGN_ROLE) || usePermission(PERMISSIONS.USERS_MANAGE)
  const [users, setUsers] = useState(loadInitialUsers)
  const [rolesList, setRolesList] = useState([])
  const [customRoles, setCustomRoles] = useState(userRoles)
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false)
  const [roleAlert, setRoleAlert] = useState(null)
  const [successAlert, setSuccessAlert] = useState(null)
  const [apiError, setApiError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSubmittingUser, setIsSubmittingUser] = useState(false)
  const [userFormError, setUserFormError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All Roles')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [registerFilter, setRegisterFilter] = useState('All Registers')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [viewingUser, setViewingUser] = useState(null)
  const [statusTarget, setStatusTarget] = useState(null)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  const [isTogglingStatus, setIsTogglingStatus] = useState(false)

  // Fetch dynamic roles and users from backend on mount
  useEffect(() => {
    let isMounted = true

    async function loadData() {
      setLoading(true)
      setApiError(null)

      // 1. Fetch available roles from Backend
      try {
        const rolesRes = await getRoles()
        if (isMounted && rolesRes?.ok && rolesRes?.data?.data?.roles) {
          const rolesData = rolesRes.data.data.roles
          setRolesList(rolesData)
          const names = rolesData.map((r) => r.name)
          setCustomRoles((prev) => Array.from(new Set([...prev, ...names])))
        }
      } catch {
        // Continue with existing roles
      }

      // 2. Fetch users from Backend GET /api/users
      try {
        const usersRes = await getUsers()
        if (!isMounted) return

        if (usersRes?.ok) {
          const backendUsers = usersRes.data?.data?.users || usersRes.data?.users
          if (Array.isArray(backendUsers) && backendUsers.length > 0) {
            setUsers((current) => {
              const normalized = backendUsers.map((u) => ({
                id: u.id,
                name: u.fullName || u.name,
                fullName: u.fullName || u.name,
                email: u.email,
                username: u.username,
                employeeId: u.employeeCode || u.employeeId || '—',
                employeeCode: u.employeeCode || u.employeeId || '—',
                role: typeof u.role === 'object' ? u.role?.name : u.role || 'Staff',
                roleId: u.role?.id ?? u.roleId,
                roleCode: u.role?.code ?? u.roleCode,
                store: u.store,
                storeName: u.storeName || u.store?.name || null,
                registerAccess: u.registerAccess || (u.allRegisters ? 'All Registers' : 'None'),
                status: u.status || (u.isActive ? 'Active' : 'Inactive'),
                isActive: u.isActive !== undefined ? u.isActive : u.status === 'Active',
                lastLogin: u.lastLogin,
                createdAt: u.createdAt,
              }))

              const backendIds = new Set(normalized.map((u) => u.id))
              const localOnly = current.filter((u) => !backendIds.has(u.id))
              const merged = [...normalized, ...localOnly]
              try {
                localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(merged))
              } catch {}
              return merged
            })
          }
        } else if (usersRes && !usersRes.ok) {
          if (usersRes.status === 401) {
            setApiError('Session not authenticated. Displaying cached staff records.')
          } else if (usersRes.status === 403) {
            setApiError('Missing users.view permission on server.')
          } else {
            setApiError(usersRes.data?.message || 'Failed to retrieve staff records from server.')
          }
        }
      } catch {
        if (isMounted) {
          setApiError('Unable to connect to POS backend server. Using local records.')
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [])

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
    setUserFormError('')
    setIsFormOpen(true)
  }

  const openEditModal = (user) => {
    setEditingUser(user)
    setUserFormError('')
    setIsFormOpen(true)
  }

  const closeFormModal = () => {
    setIsFormOpen(false)
    setEditingUser(null)
    setUserFormError('')
    setIsSubmittingUser(false)
  }

  const handleUserSubmit = async (formData) => {
    if (editingUser) {
      setIsSubmittingUser(true)
      setUserFormError('')

      try {
        let resolvedRoleId = formData.roleId
        if (!resolvedRoleId && rolesList.length > 0) {
          const found = rolesList.find(
            (r) =>
              r.name?.toLowerCase() === formData.role?.toLowerCase() ||
              String(r.id) === String(formData.role)
          )
          if (found) resolvedRoleId = found.id
        }

        const payload = {
          fullName: formData.name,
          name: formData.name,
          email: formData.email,
          employeeCode: formData.employeeId,
          employeeId: formData.employeeId,
          roleId: resolvedRoleId,
          role: formData.role,
          registerAccess: formData.registerAccess,
          status: formData.status,
        }

        const res = await updateStaffUser(editingUser.id, payload)

        if (res?.ok && (res.data?.data?.user || res.data?.user)) {
          const updatedUser = res.data?.data?.user || res.data?.user
          const formatted = {
            id: updatedUser.id,
            name: updatedUser.fullName || updatedUser.name,
            fullName: updatedUser.fullName || updatedUser.name,
            email: updatedUser.email,
            username: updatedUser.username || editingUser.username,
            employeeId: updatedUser.employeeCode || updatedUser.employeeId || formData.employeeId,
            employeeCode: updatedUser.employeeCode || updatedUser.employeeId || formData.employeeId,
            role:
              typeof updatedUser.role === 'object'
                ? updatedUser.role?.name
                : updatedUser.role || formData.role,
            roleId: updatedUser.role?.id ?? updatedUser.roleId ?? resolvedRoleId,
            roleCode: updatedUser.role?.code ?? updatedUser.roleCode,
            store: updatedUser.store || editingUser.store,
            storeName: updatedUser.storeName || updatedUser.store?.name || editingUser.storeName || null,
            registerAccess: updatedUser.registerAccess || formData.registerAccess,
            status: updatedUser.status || formData.status,
            isActive: updatedUser.isActive !== undefined ? updatedUser.isActive : updatedUser.status === 'Active',
            lastLogin: updatedUser.lastLogin || editingUser.lastLogin,
            createdAt: updatedUser.createdAt || editingUser.createdAt,
          }

          setUsers((current) => {
            const next = current.map((u) => (u.id === editingUser.id ? formatted : u))
            try {
              localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(next))
            } catch {}
            return next
          })

          setSuccessAlert({
            title: 'Staff Member Updated Successfully!',
            message: `Staff member "${formatted.name}" has been updated.`,
          })

          closeFormModal()

          // Background sync refresh from GET /api/users
          getUsers()
            .then((refreshRes) => {
              if (refreshRes?.ok) {
                const list = refreshRes.data?.data?.users || refreshRes.data?.users
                if (Array.isArray(list) && list.length > 0) {
                  setUsers((curr) => {
                    const bIds = new Set(list.map((u) => u.id))
                    const localOnly = curr.filter((u) => !bIds.has(u.id))
                    return [...list, ...localOnly]
                  })
                }
              }
            })
            .catch(() => {})
        } else {
          const errorMsg = res?.data?.message || res?.error || 'Failed to update staff member on server.'
          setUserFormError(errorMsg)
        }
      } catch (err) {
        setUserFormError(err.message || 'Error communicating with backend server.')
      } finally {
        setIsSubmittingUser(false)
      }
      return
    }

    // Creating a new staff member via POST /api/users
    setIsSubmittingUser(true)
    setUserFormError('')

    try {
      let roleId = formData.roleId
      if (!roleId && rolesList.length > 0) {
        const found = rolesList.find(
          (r) => r.name?.toLowerCase() === formData.role?.toLowerCase() || String(r.id) === String(formData.role)
        )
        if (found) roleId = found.id
      }

      const payload = {
        fullName: formData.name,
        name: formData.name,
        email: formData.email,
        employeeCode: formData.employeeId,
        employeeId: formData.employeeId,
        roleId: roleId || 3,
        role: formData.role,
        registerAccess: formData.registerAccess,
        status: formData.status || 'Active',
      }

      const res = await createStaffUser(payload)

      if (res?.ok && (res.data?.data?.user || res.data?.user)) {
        const createdUser = res.data?.data?.user || res.data?.user

        const formattedNewUser = {
          id: createdUser.id,
          name: createdUser.fullName || createdUser.name,
          fullName: createdUser.fullName || createdUser.name,
          email: createdUser.email,
          employeeId: createdUser.employeeCode || createdUser.employeeId || formData.employeeId,
          employeeCode: createdUser.employeeCode || createdUser.employeeId || formData.employeeId,
          role: typeof createdUser.role === 'object' ? createdUser.role?.name : createdUser.role || formData.role,
          roleId: createdUser.role?.id ?? createdUser.roleId ?? roleId,
          roleCode: createdUser.role?.code ?? createdUser.roleCode,
          store: createdUser.store,
          storeName: createdUser.storeName || createdUser.store?.name || null,
          registerAccess: createdUser.registerAccess || formData.registerAccess,
          status: createdUser.status || formData.status || 'Active',
          isActive: createdUser.isActive !== undefined ? createdUser.isActive : true,
          lastLogin: createdUser.lastLogin || null,
          createdAt: createdUser.createdAt || new Date().toISOString(),
        }

        setUsers((current) => {
          const updated = [formattedNewUser, ...current.filter((u) => u.id !== formattedNewUser.id)]
          try {
            localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated))
          } catch {}
          return updated
        })

        setSuccessAlert({
          title: 'Staff Member Created Successfully!',
          message: `Staff member "${formattedNewUser.name}" (${formattedNewUser.email}) has been added with role "${formattedNewUser.role}".`,
        })

        closeFormModal()

        // Background sync refresh from GET /api/users
        getUsers()
          .then((refreshRes) => {
            if (refreshRes?.ok) {
              const list = refreshRes.data?.data?.users || refreshRes.data?.users
              if (Array.isArray(list) && list.length > 0) {
                setUsers((curr) => {
                  const bIds = new Set(list.map((u) => u.id))
                  const localOnly = curr.filter((u) => !bIds.has(u.id))
                  return [...list, ...localOnly]
                })
              }
            }
          })
          .catch(() => {})
      } else {
        const errorMsg = res?.data?.message || res?.error || 'Failed to create staff member.'
        setUserFormError(errorMsg)
      }
    } catch (err) {
      setUserFormError(err.message || 'Error communicating with backend server.')
    } finally {
      setIsSubmittingUser(false)
    }
  }

  const openStatusConfirm = (userId) => {
    setStatusTarget(userId)
    setIsConfirmOpen(true)
  }

  const closeStatusConfirm = () => {
    setStatusTarget(null)
    setIsConfirmOpen(false)
  }

  const handleToggleStatus = async () => {
    if (!statusTarget || isTogglingStatus) return

    const targetUser = users.find((user) => user.id === statusTarget)
    if (!targetUser) {
      closeStatusConfirm()
      return
    }

    const newIsActive = targetUser.status !== 'Active'
    const newStatus = newIsActive ? 'Active' : 'Inactive'

    setIsTogglingStatus(true)
    try {
      const res = await updateStaffStatus(statusTarget, newIsActive)

      if (res?.ok) {
        setUsers((currentUsers) => {
          const updated = currentUsers.map((user) =>
            user.id === statusTarget
              ? {
                  ...user,
                  status: newStatus,
                  isActive: newIsActive,
                }
              : user,
          )
          try {
            localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated))
          } catch {}
          return updated
        })

        setSuccessAlert({
          title: `Staff Member ${newIsActive ? 'Activated' : 'Deactivated'} Successfully!`,
          message: `Staff member "${targetUser.name}" has been set to ${newStatus}.`,
        })

        closeStatusConfirm()

        // Background sync refresh from GET /api/users
        getUsers()
          .then((refreshRes) => {
            if (refreshRes?.ok) {
              const list = refreshRes.data?.data?.users || refreshRes.data?.users
              if (Array.isArray(list) && list.length > 0) {
                setUsers((curr) => {
                  const bIds = new Set(list.map((u) => u.id))
                  const localOnly = curr.filter((u) => !bIds.has(u.id))
                  return [...list, ...localOnly]
                })
              }
            }
          })
          .catch(() => {})
      } else {
        const errorMsg = res?.data?.message || res?.error || 'Failed to update staff status.'
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

  if (!canViewUsers) {
    return (
      <div className="products-page users-page">
        <header className="products-page__header users-page__header">
          <div>
            <span className="section-label">Staff Management</span>
            <h2>Users</h2>
            <p>Manage staff accounts, roles, register access, and account status.</p>
          </div>
        </header>

        <Card className="products-table-card users-table-card">
          <div className="inventory-empty-state" style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
            <strong style={{ fontSize: '1.2rem', color: '#ef4444', display: 'block', marginBottom: '0.5rem' }}>
              Access Denied
            </strong>
            <p style={{ color: '#6b7280' }}>
              You do not have the required <code>users.view</code> permission to view staff members.
            </p>
          </div>
        </Card>
      </div>
    )
  }

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
          {canCreateStaff ? (
            <Button variant="primary" type="button" onClick={openAddModal}>+ Add User</Button>
          ) : (
            <Button
              variant="primary"
              type="button"
              disabled
              title="Requires users.create permission"
              style={{ opacity: 0.55, cursor: 'not-allowed' }}
            >
              + Add User
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

      {roleAlert && (
        <div className="users-page__alert">
          <div>
            <strong>{roleAlert.title}</strong> {roleAlert.message}
          </div>
          <button type="button" onClick={() => setRoleAlert(null)} aria-label="Dismiss">×</button>
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
              {loading ? (
                <tr>
                  <td colSpan="7">
                    <div className="inventory-empty-state" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                      <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Loading staff records...</strong>
                      <span style={{ color: '#6b7280' }}>Fetching real staff data from POS backend API.</span>
                    </div>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
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
                          <div className="user-cell__meta">
                            <span>{user.email}</span>
                            {user.storeName && (
                              <span style={{ marginLeft: '0.4rem', opacity: 0.8 }}>• {user.storeName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{user.employeeId}</td>
                    <td>
                      <Badge tone={user.role === 'Administrator' || user.role === 'Admin' ? 'success' : user.role === 'Manager' ? 'warning' : user.role === 'Cashier' ? 'info' : user.role === 'Inventory Clerk' ? 'default' : 'warning'}>{user.role}</Badge>
                    </td>
                    <td>{user.registerAccess}</td>
                    <td>{formatDateTime(user.lastLogin)}</td>
                    <td>
                      <Badge tone={user.status === 'Active' ? 'success' : 'warning'}>{user.status}</Badge>
                    </td>
                    <td>
                      <div className="product-row-actions users-actions">
                        <button type="button" onClick={() => setViewingUser(user)}>View</button>
                        {canUpdateStaff ? (
                          <button type="button" onClick={() => openEditModal(user)}>Edit</button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            title="Requires users.update permission"
                            style={{ opacity: 0.5, cursor: 'not-allowed' }}
                          >
                            Edit
                          </button>
                        )}
                        {canUpdateStaff ? (
                          <button
                            type="button"
                            className={user.status === 'Active' ? 'danger' : ''}
                            onClick={() => openStatusConfirm(user.id)}
                          >
                            {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={user.status === 'Active' ? 'danger' : ''}
                            disabled
                            title="Requires users.update permission"
                            style={{ opacity: 0.5, cursor: 'not-allowed' }}
                          >
                            {user.status === 'Active' ? 'Deactivate' : 'Activate'}
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


      <UserFormModal
        isOpen={isFormOpen}
        onClose={closeFormModal}
        onSubmit={handleUserSubmit}
        initialValues={editingUser}
        mode={editingUser ? 'edit' : 'add'}
        existingUsers={users}
        roleOptions={rolesList.length > 0 ? rolesList : customRoles}
        isSubmitting={isSubmittingUser}
        externalError={userFormError}
        canAssignRole={canAssignRole}
      />

      <RoleFormModal
        isOpen={isRoleModalOpen}
        onClose={() => setIsRoleModalOpen(false)}
        onSuccess={handleRoleCreated}
        existingRoles={customRoles}
      />

      <UserDetailsModal user={viewingUser} onClose={() => setViewingUser(null)} />

      {isConfirmOpen && (
        <div className="modal-backdrop" onClick={!isTogglingStatus ? closeStatusConfirm : undefined}>
          <div className="confirmation-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{statusTargetUser?.status === 'Active' ? 'Deactivate User' : 'Activate User'}</h3>
            <p>
              {statusTargetUser?.status === 'Active'
                ? `Are you sure you want to deactivate ${statusTargetUser?.name || 'this staff member'}? Deactivated staff cannot access the system and their active sessions will be terminated.`
                : `Are you sure you want to activate ${statusTargetUser?.name || 'this staff member'}? The account will be restored and allowed to log in.`}
            </p>
            <div className="confirmation-modal__actions">
              <Button
                variant="secondary"
                type="button"
                onClick={closeStatusConfirm}
                disabled={isTogglingStatus}
              >
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
                  : statusTargetUser?.status === 'Active'
                  ? 'Deactivate User'
                  : 'Activate User'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UsersPage

import { useAuth } from '../context/AuthContext'

// Single source of truth for frontend role permissions.
//
// IMPORTANT: frontend authorization is a UX guard only — it hides navigation
// and blocks routes in the browser, but anyone can bypass it. Real enforcement
// must happen on the backend, which should eventually supply these permissions
// (e.g. with the session) and replace this matrix.

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  POS_USE: 'pos.use',
  PRODUCTS_VIEW: 'products.view',
  PRODUCTS_MANAGE: 'products.manage',
  CATEGORIES_VIEW: 'categories.view',
  CATEGORIES_MANAGE: 'categories.manage',
  SUPPLIERS_VIEW: 'suppliers.view',
  SUPPLIERS_MANAGE: 'suppliers.manage',
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_MANAGE: 'inventory.manage',
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_MANAGE: 'customers.manage',
  ORDERS_VIEW: 'orders.view',
  INVOICES_VIEW: 'invoices.view',
  RETURNS_VIEW: 'returns.view',
  RETURNS_PROCESS: 'returns.process',
  REPORTS_VIEW: 'reports.view',
  USERS_MANAGE: 'users.manage',
  SETTINGS_MANAGE: 'settings.manage',
}

const ALL_PERMISSIONS = Object.values(PERMISSIONS)

export const ROLE_PERMISSIONS = {
  Admin: ALL_PERMISSIONS,
  Manager: ALL_PERMISSIONS.filter(
    (permission) => permission !== PERMISSIONS.USERS_MANAGE && permission !== PERMISSIONS.SETTINGS_MANAGE,
  ),
  Cashier: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.POS_USE,
    PERMISSIONS.CUSTOMERS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.RETURNS_VIEW,
  ],
}

// No permission required → allowed for any signed-in user.
export function hasPermission(user, permission) {
  if (!user) return false
  if (!permission) return true
  return (ROLE_PERMISSIONS[user.role] || []).includes(permission)
}

export function usePermission(permission) {
  const { user } = useAuth()
  return hasPermission(user, permission)
}

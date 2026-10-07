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

export const PERMISSION_CATEGORIES = [
  {
    category: 'POS & Register',
    description: 'Point of sale transactions and receipt operations',
    permissions: [
      { key: PERMISSIONS.POS_USE, label: 'Access POS Register', description: 'Ring up sales and process checkout' },
      { key: PERMISSIONS.ORDERS_VIEW, label: 'View Orders', description: 'Browse and search sales orders' },
      { key: PERMISSIONS.INVOICES_VIEW, label: 'View Invoices', description: 'Access past receipts and invoices' },
      { key: PERMISSIONS.RETURNS_VIEW, label: 'View Returns', description: 'View refund and return history' },
      { key: PERMISSIONS.RETURNS_PROCESS, label: 'Process Returns', description: 'Accept returns and authorize refunds' },
    ],
  },
  {
    category: 'Inventory & Catalog',
    description: 'Products, categories, and inventory control',
    permissions: [
      { key: PERMISSIONS.PRODUCTS_VIEW, label: 'View Products', description: 'Browse product listings and details' },
      { key: PERMISSIONS.PRODUCTS_MANAGE, label: 'Manage Products', description: 'Add, update, or delete products' },
      { key: PERMISSIONS.CATEGORIES_VIEW, label: 'View Categories', description: 'Browse categories' },
      { key: PERMISSIONS.CATEGORIES_MANAGE, label: 'Manage Categories', description: 'Add, edit, or remove categories' },
      { key: PERMISSIONS.INVENTORY_VIEW, label: 'View Stock', description: 'Check warehouse and store inventory' },
      { key: PERMISSIONS.INVENTORY_MANAGE, label: 'Adjust Stock', description: 'Stock in/out and reconcile inventory' },
      { key: PERMISSIONS.SUPPLIERS_VIEW, label: 'View Suppliers', description: 'Browse vendor and supplier records' },
      { key: PERMISSIONS.SUPPLIERS_MANAGE, label: 'Manage Suppliers', description: 'Add and edit supplier contacts' },
    ],
  },
  {
    category: 'Customers & Analytics',
    description: 'Customer loyalty, reporting, and dashboard metrics',
    permissions: [
      { key: PERMISSIONS.DASHBOARD_VIEW, label: 'View Dashboard', description: 'See high-level store sales metrics' },
      { key: PERMISSIONS.CUSTOMERS_VIEW, label: 'View Customers', description: 'Browse customer list and history' },
      { key: PERMISSIONS.CUSTOMERS_MANAGE, label: 'Manage Customers', description: 'Add or edit customer information' },
      { key: PERMISSIONS.REPORTS_VIEW, label: 'View Reports', description: 'Generate end-of-day and sales reports' },
    ],
  },
  {
    category: 'System Administration',
    description: 'User access control and configuration',
    permissions: [
      { key: PERMISSIONS.USERS_MANAGE, label: 'Manage Users & Roles', description: 'Create and edit staff users and custom roles' },
      { key: PERMISSIONS.SETTINGS_MANAGE, label: 'Store Settings', description: 'Configure taxes, registers, and receipt format' },
    ],
  },
]

// Register dynamic role permissions at runtime
export function registerCustomRolePermissions(roleName, permissions = []) {
  if (roleName) {
    ROLE_PERMISSIONS[roleName] = permissions
  }
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


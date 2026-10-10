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
  PRODUCTS_CREATE: 'products.create',
  PRODUCTS_UPDATE: 'products.update',
  PRODUCTS_MANAGE: 'products.manage',
  CATEGORIES_VIEW: 'categories.view',
  CATEGORIES_CREATE: 'categories.create',
  CATEGORIES_UPDATE: 'categories.update',
  CATEGORIES_MANAGE: 'categories.manage',
  SUPPLIERS_VIEW: 'suppliers.view',
  SUPPLIERS_CREATE: 'suppliers.create',
  SUPPLIERS_UPDATE: 'suppliers.update',
  SUPPLIERS_MANAGE: 'suppliers.manage',
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_ADJUST: 'inventory.adjust',
  INVENTORY_MANAGE: 'inventory.manage',
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_UPDATE: 'customers.update',
  CUSTOMERS_MANAGE: 'customers.manage',
  ORDERS_VIEW: 'orders.view',
  POS_ORDERS_VIEW: 'pos_orders.view',
  POS_ORDERS_CREATE: 'pos_orders.create',
  POS_ORDERS_UPDATE: 'pos_orders.update',
  POS_ORDERS_CANCEL: 'pos_orders.cancel',
  POS_ORDERS_COMPLETE: 'pos_orders.complete',
  INVOICES_VIEW: 'invoices.view',
  RETURNS_VIEW: 'returns.view',
  RETURNS_PROCESS: 'returns.process',
  REPORTS_VIEW: 'reports.view',
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_ASSIGN_ROLE: 'users.assign_role',
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
    PERMISSIONS.POS_ORDERS_VIEW,
    PERMISSIONS.POS_ORDERS_CREATE,
    PERMISSIONS.POS_ORDERS_UPDATE,
    PERMISSIONS.POS_ORDERS_CANCEL,
    PERMISSIONS.POS_ORDERS_COMPLETE,
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
      { key: PERMISSIONS.POS_ORDERS_VIEW, label: 'View POS Orders', description: 'Browse and search POS orders' },
      { key: PERMISSIONS.POS_ORDERS_CREATE, label: 'Create POS Order', description: 'Save carts as draft POS orders' },
      { key: PERMISSIONS.POS_ORDERS_UPDATE, label: 'Update POS Order', description: 'Modify draft POS orders' },
      { key: PERMISSIONS.POS_ORDERS_CANCEL, label: 'Cancel POS Order', description: 'Cancel eligible draft POS orders' },
      { key: PERMISSIONS.POS_ORDERS_COMPLETE, label: 'Complete POS Order', description: 'Finalize draft orders and deduct stock' },
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
      { key: PERMISSIONS.PRODUCTS_CREATE, label: 'Create Products', description: 'Create new catalog products' },
      { key: PERMISSIONS.PRODUCTS_UPDATE, label: 'Update Products', description: 'Edit product details and toggle active status' },
      { key: PERMISSIONS.PRODUCTS_MANAGE, label: 'Manage Products', description: 'Add, update, or delete products' },
      { key: PERMISSIONS.CATEGORIES_VIEW, label: 'View Categories', description: 'Browse categories' },
      { key: PERMISSIONS.CATEGORIES_CREATE, label: 'Create Categories', description: 'Create new product categories' },
      { key: PERMISSIONS.CATEGORIES_UPDATE, label: 'Update Categories', description: 'Edit and activate/deactivate categories' },
      { key: PERMISSIONS.CATEGORIES_MANAGE, label: 'Manage Categories', description: 'Add, edit, or remove categories' },
      { key: PERMISSIONS.INVENTORY_VIEW, label: 'View Stock', description: 'Check warehouse and store inventory' },
      { key: PERMISSIONS.INVENTORY_ADJUST, label: 'Adjust Stock', description: 'Enter opening stock and make stock adjustments' },
      { key: PERMISSIONS.INVENTORY_MANAGE, label: 'Manage Stock', description: 'Stock in/out and reconcile inventory' },
      { key: PERMISSIONS.SUPPLIERS_VIEW, label: 'View Suppliers', description: 'Browse vendor and supplier records' },
      { key: PERMISSIONS.SUPPLIERS_CREATE, label: 'Create Suppliers', description: 'Add new vendor and supplier profiles' },
      { key: PERMISSIONS.SUPPLIERS_UPDATE, label: 'Update Suppliers', description: 'Edit supplier details and toggle active status' },
      { key: PERMISSIONS.SUPPLIERS_MANAGE, label: 'Manage Suppliers', description: 'Add and edit supplier contacts' },
    ],
  },
  {
    category: 'Customers & Analytics',
    description: 'Customer loyalty, reporting, and dashboard metrics',
    permissions: [
      { key: PERMISSIONS.DASHBOARD_VIEW, label: 'View Dashboard', description: 'See high-level store sales metrics' },
      { key: PERMISSIONS.CUSTOMERS_VIEW, label: 'View Customers', description: 'Browse customer list and history' },
      { key: PERMISSIONS.CUSTOMERS_CREATE, label: 'Create Customers', description: 'Add new customer profiles' },
      { key: PERMISSIONS.CUSTOMERS_UPDATE, label: 'Update Customers', description: 'Edit customer details and toggle active status' },
      { key: PERMISSIONS.CUSTOMERS_MANAGE, label: 'Manage Customers', description: 'Full customer management' },
      { key: PERMISSIONS.REPORTS_VIEW, label: 'View Reports', description: 'Generate end-of-day and sales reports' },
    ],
  },
  {
    category: 'System Administration',
    description: 'User access control and configuration',
    permissions: [
      { key: PERMISSIONS.USERS_VIEW, label: 'View Users & Staff', description: 'Browse and search staff members list' },
      { key: PERMISSIONS.USERS_CREATE, label: 'Create Staff', description: 'Create and invite new staff members' },
      { key: PERMISSIONS.USERS_UPDATE, label: 'Edit Staff', description: 'Edit staff profile details and account status' },
      { key: PERMISSIONS.USERS_ASSIGN_ROLE, label: 'Assign Staff Roles', description: 'Change roles assigned to staff members' },
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

  // Support dynamic permissions list returned from backend user session
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    if (user.permissions.includes(permission)) return true
    if (user.role === 'Admin' || user.roleCode === 'ADMIN' || user.role?.code === 'ADMIN') return true
  }

  const roleName = typeof user.role === 'object' ? user.role?.name : user.role
  return (ROLE_PERMISSIONS[roleName] || []).includes(permission)
}

export function usePermission(permission) {
  const { user } = useAuth()
  return hasPermission(user, permission)
}



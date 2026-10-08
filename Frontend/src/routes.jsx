import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardPage from './components/DashboardPage'
import PlaceholderPage from './components/PlaceholderPage'
import POSRegisterPage from './components/POSRegisterPage'
import ProductsPage from './components/ProductsPage'
import CategoriesPage from './components/CategoriesPage'
import SuppliersPage from './components/SuppliersPage'
import InventoryPage from './components/InventoryPage'
import CustomersPage from './components/CustomersPage'
import OrdersPage from './components/OrdersPage'
import InvoicesPage from './components/InvoicesPage'
import ReturnsPage from './components/ReturnsPage'
import ReportsPage from './components/ReportsPage'
import UsersPage from './components/UsersPage'
import SettingsPage from './components/SettingsPage'
import NotFoundPage from './components/NotFoundPage'
import ProfilePage from './components/profile/ProfilePage'
import ProtectedRoute from './components/auth/ProtectedRoute'
import { PERMISSIONS } from './auth/permissions'

const paths = {
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  dashboard: '/dashboard',
  pos: '/pos',
  products: '/products',
  categories: '/categories',
  suppliers: '/suppliers',
  inventory: '/inventory',
  customers: '/customers',
  orders: '/orders',
  invoices: '/invoices',
  returns: '/returns',
  reports: '/reports',
  users: '/users',
  settings: '/settings',
  profile: '/profile',
}

// `permission` is the frontend (UX-only) guard for each screen; see src/auth/permissions.js.
const routeDefinitions = [
  { path: paths.dashboard, element: <DashboardPage />, label: 'Dashboard', permission: PERMISSIONS.DASHBOARD_VIEW },
  { path: paths.pos, element: <POSRegisterPage />, label: 'POS Register', permission: PERMISSIONS.POS_USE },
  { path: paths.products, element: <ProductsPage />, label: 'Products', permission: PERMISSIONS.PRODUCTS_VIEW },
  { path: paths.categories, element: <CategoriesPage />, label: 'Categories', permission: PERMISSIONS.CATEGORIES_VIEW },
  { path: paths.suppliers, element: <SuppliersPage />, label: 'Suppliers', permission: PERMISSIONS.SUPPLIERS_VIEW },
  { path: paths.inventory, element: <InventoryPage />, label: 'Inventory', permission: PERMISSIONS.INVENTORY_VIEW },
  { path: paths.customers, element: <CustomersPage />, label: 'Customers', permission: PERMISSIONS.CUSTOMERS_VIEW },
  { path: paths.orders, element: <OrdersPage />, label: 'Orders', permission: PERMISSIONS.ORDERS_VIEW },
  { path: paths.invoices, element: <InvoicesPage />, label: 'Invoices', permission: PERMISSIONS.INVOICES_VIEW },
  { path: paths.returns, element: <ReturnsPage />, label: 'Returns', permission: PERMISSIONS.RETURNS_VIEW },
  { path: paths.reports, element: <ReportsPage />, label: 'Reports', permission: PERMISSIONS.REPORTS_VIEW },
  { path: paths.users, element: <UsersPage />, label: 'Users', permission: PERMISSIONS.USERS_VIEW },
  { path: paths.settings, element: <SettingsPage />, label: 'Settings', permission: PERMISSIONS.SETTINGS_MANAGE },
  // Own account only; open to every signed-in role. Not shown in the Sidebar.
  { path: paths.profile, element: <ProfilePage />, label: 'My Profile' },
]

function getRoutePermission(path) {
  return routeDefinitions.find((route) => route.path === path)?.permission
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={paths.dashboard} replace />} />
      {routeDefinitions.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={<ProtectedRoute permission={route.permission}>{route.element}</ProtectedRoute>}
        />
      ))}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export { paths, routeDefinitions, getRoutePermission }
export default AppRoutes

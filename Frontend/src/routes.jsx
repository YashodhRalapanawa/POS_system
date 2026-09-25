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

const paths = {
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
}

const routeDefinitions = [
  { path: paths.dashboard, element: <DashboardPage />, label: 'Dashboard' },
  { path: paths.pos, element: <POSRegisterPage />, label: 'POS Register' },
  { path: paths.products, element: <ProductsPage />, label: 'Products' },
  { path: paths.categories, element: <CategoriesPage />, label: 'Categories' },
  { path: paths.suppliers, element: <SuppliersPage />, label: 'Suppliers' },
  { path: paths.inventory, element: <InventoryPage />, label: 'Inventory' },
  { path: paths.customers, element: <CustomersPage />, label: 'Customers' },
  { path: paths.orders, element: <OrdersPage />, label: 'Orders' },
  { path: paths.invoices, element: <InvoicesPage />, label: 'Invoices' },
  { path: paths.returns, element: <ReturnsPage />, label: 'Returns' },
  { path: paths.reports, element: <ReportsPage />, label: 'Reports' },
  { path: paths.users, element: <UsersPage />, label: 'Users' },
  { path: paths.settings, element: <SettingsPage />, label: 'Settings' },
]

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={paths.dashboard} replace />} />
      {routeDefinitions.map((route) => (
        <Route key={route.path} path={route.path} element={route.element} />
      ))}
    </Routes>
  )
}

export { paths, routeDefinitions }
export default AppRoutes

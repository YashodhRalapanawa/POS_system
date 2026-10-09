import { NavLink } from 'react-router-dom'
import { paths } from '../paths'
import { getRoutePermission } from '../routes'
import { useAuth } from '../context/AuthContext'

const primaryNav = [
  { label: 'Dashboard', path: paths.dashboard, icon: '📊' },
  { label: 'POS Register', path: paths.pos, icon: '🛒' },
  { label: 'Products', path: paths.products, icon: '📦' },
  { label: 'Categories', path: paths.categories, icon: '🏷️' },
  { label: 'Suppliers', path: paths.suppliers, icon: '🚚' },
  { label: 'Inventory', path: paths.inventory, icon: '🏬' },
  { label: 'Customers', path: paths.customers, icon: '👥' },
  { label: 'Orders', path: paths.orders, icon: '🧾' },
  { label: 'Invoices', path: paths.invoices, icon: '📄' },
  { label: 'Returns', path: paths.returns, icon: '↩️' },
]

const secondaryNav = [
  { label: 'Reports', path: paths.reports, icon: '📈' },
  { label: 'Users', path: paths.users, icon: '👤' },
  { label: 'Settings', path: paths.settings, icon: '⚙️' },
]

function Sidebar() {
  const { hasPermission } = useAuth()
  // UX only: hide links the current role cannot open (routes are guarded too).
  const canOpen = (item) => hasPermission(getRoutePermission(item.path))

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <div className="brand">
          <div className="brand__mark">V</div>
          <div className="brand__text">
            <span className="brand__name">VANTRIX POS</span>
            <span className="brand__sub">Enterprise Core</span>
          </div>
        </div>

        <nav className="sidebar__section" aria-label="Primary navigation">
          {primaryNav.filter(canOpen).map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
            >
              <span className="nav-item__icon" style={{ fontSize: '16px', lineHeight: 1 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <nav className="sidebar__section sidebar__section--secondary" aria-label="Secondary navigation">
          {secondaryNav.filter(canOpen).map((item) => (
            <NavLink
              key={item.label}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
            >
              <span className="nav-item__icon" style={{ fontSize: '16px', lineHeight: 1 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  )
}

export default Sidebar

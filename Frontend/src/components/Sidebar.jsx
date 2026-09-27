import { NavLink } from 'react-router-dom'
import { getRoutePermission, paths } from '../routes'
import { useAuth } from '../context/AuthContext'

const primaryNav = [
  { label: 'Dashboard', path: paths.dashboard },
  { label: 'POS Register', path: paths.pos },
  { label: 'Products', path: paths.products },
  { label: 'Categories', path: paths.categories },
  { label: 'Suppliers', path: paths.suppliers },
  { label: 'Inventory', path: paths.inventory },
  { label: 'Customers', path: paths.customers },
  { label: 'Orders', path: paths.orders },
  { label: 'Invoices', path: paths.invoices },
  { label: 'Returns', path: paths.returns },
]

const secondaryNav = [
  { label: 'Reports', path: paths.reports },
  { label: 'Users', path: paths.users },
  { label: 'Settings', path: paths.settings },
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
              <span className="nav-item__dot" aria-hidden="true" />
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
              <span className="nav-item__dot" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="sidebar__footer">
        <div className="register-indicator">
          <span className="register-indicator__label">Register #03</span>
          <span className="register-indicator__meta">Sarah Jenkins</span>
        </div>
        <button type="button" className="sidebar__logout">
          End Shift &amp; Logout
        </button>
      </div>
    </aside>
  )
}

export default Sidebar

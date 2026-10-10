import { Link, useNavigate } from 'react-router-dom'
import { topbarActions } from '../data/mockDashboard'
import { useAuth } from '../context/AuthContext'
import { paths } from '../routes'

function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate(paths.login, { replace: true })
  }

  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="topbar__title-group">
          <span className="topbar__eyebrow">Store</span>
          <h1>Store Operations Overview</h1>
        </div>
      </div>

      <div className="topbar__right">
        {topbarActions.map((label) => (
          <button key={label} type="button" className="topbar__action">
            {label}
          </button>
        ))}
        <Link to={paths.profile} className="topbar__user topbar__user--link" title="My Profile">
          <div className="avatar">{getInitials(user?.fullName)}</div>
          <div className="user-meta">
            <span>{user?.fullName}</span>
            <small>{user?.role}</small>
          </div>
          <span className="auth-sr-only">— My Profile</span>
        </Link>
        <button type="button" className="topbar__action" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </header>
  )
}

export default Topbar

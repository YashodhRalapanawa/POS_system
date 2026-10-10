import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { hasPermission } from '../../auth/permissions'
import { getRoutePermission, paths, routeDefinitions } from '../../routes'
import AccessDeniedPage from './AccessDeniedPage'

function AuthLoading() {
  return (
    <div className="auth-loading" role="status" aria-live="polite">
      <span className="auth-loading__spinner" aria-hidden="true" />
      <span>Loading session…</span>
    </div>
  )
}

function canOpen(user, pathname) {
  return routeDefinitions.some((route) => route.path === pathname) && hasPermission(user, getRoutePermission(pathname))
}

// Where to go after login: the originally requested page if this user's role
// may open it, otherwise their preferred landing page, otherwise the dashboard.
function getReturnPath(state, user, landingPage) {
  const from = state?.from
  if (from?.pathname && from.pathname !== paths.login && canOpen(user, from.pathname)) {
    return `${from.pathname}${from.search || ''}${from.hash || ''}`
  }
  if (landingPage && canOpen(user, landingPage)) return landingPage
  return paths.dashboard
}

// Requires a session; with `permission`, also requires that permission.
// NOTE: this is a frontend UX guard only — the backend must enforce access.
function ProtectedRoute({ children, permission }) {
  const { user, isAuthenticated, loading, signOutReason } = useAuth()
  const location = useLocation()

  if (loading) return <AuthLoading />
  if (!isAuthenticated) {
    return <Navigate to={paths.login} replace state={{ from: location, notice: signOutReason || undefined }} />
  }
  if (permission && !hasPermission(user, permission)) {
    return <AccessDeniedPage />
  }
  return children
}

// Guards /login: signed-in users are sent back to where they were heading.
function PublicOnlyRoute({ children }) {
  const { user, isAuthenticated, loading, preferences } = useAuth()
  const location = useLocation()

  if (loading) return <AuthLoading />
  if (isAuthenticated) {
    return <Navigate to={getReturnPath(location.state, user, preferences.landingPage)} replace />
  }
  return children
}

export { PublicOnlyRoute }
export default ProtectedRoute

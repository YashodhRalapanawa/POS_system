import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { defaultUserPreferences } from '../data/mockUsers'
import { hasPermission as roleHasPermission } from '../auth/permissions'
import { apiFetch } from '../services/api'
import { createAuthClient, readSession, SESSION_KEY, SESSION_EXPIRED_EVENT } from '../services/authSession.mjs'
import InactivityGuard from '../components/auth/InactivityGuard'

const AuthContext = createContext(null)
const EXPIRED = 'Your session has expired. Sign in again to continue.'
const UNAVAILABLE = 'This account change is not available yet. Contact your administrator.'
const unavailable = async () => ({ ok: false, error: UNAVAILABLE,
  fieldErrors: { email: UNAVAILABLE, fullName: UNAVAILABLE, currentPassword: UNAVAILABLE } })
const unchecked = () => false
function loadPreferences() {
  try { return JSON.parse(localStorage.getItem('vantrix.preferences') || '{}') || {} }
  catch { return {} }
}

function AuthProvider({ children }) {
  const [client] = useState(() => createAuthClient(apiFetch))
  const [authenticated, setAuthenticated] = useState(null)
  const [loading, setLoading] = useState(true)
  const [signOutReason, setSignOutReason] = useState(null)
  const [localPreferences, setLocalPreferences] = useState(loadPreferences)
  const user = authenticated?.user || null

  const endSession = useCallback((reason = null) => {
    client.logout()
    setAuthenticated(null)
    setSignOutReason(reason)
  }, [client])
  const logout = useCallback(() => endSession(), [endSession])
  const logoutForInactivity = useCallback(() => endSession('You were signed out due to inactivity. Sign in again to continue.'), [endSession])

  useEffect(() => {
    let cancelled = false
    client.restore().then((restored) => {
      if (!cancelled) {
        setAuthenticated(restored)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [client])

  useEffect(() => {
    const expire = () => endSession(EXPIRED)
    // A change in another tab requires fresh authentication here, avoiding stale profiles.
    const storageChanged = (event) => {
      if (event.key === SESSION_KEY || event.key === null) {
        client.invalidate()
        setAuthenticated(null)
        setSignOutReason('Your session changed in another tab. Sign in again.')
      }
    }
    const checkExpiry = () => { if (user && !readSession()) expire() }
    window.addEventListener(SESSION_EXPIRED_EVENT, expire)
    window.addEventListener('storage', storageChanged)
    window.addEventListener('focus', checkExpiry)
    const timer = authenticated && window.setTimeout(expire,
      Math.min(Math.max(0, authenticated.session.expiresAt * 1000 - Date.now()), 2147483647))
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, expire)
      window.removeEventListener('storage', storageChanged)
      window.removeEventListener('focus', checkExpiry)
      if (timer) window.clearTimeout(timer)
    }
  }, [authenticated, user, endSession, client])

  const login = useCallback(async (identifier, password, rememberMe) => {
    const result = await client.login(identifier, password, rememberMe)
    if (result.ok) {
      setAuthenticated({ user: result.user, session: result.session })
      setSignOutReason(null)
    }
    return result
  }, [client])
  const hasPermission = useCallback((permission) => roleHasPermission(user, permission), [user])
  const hasRole = useCallback((...roles) => Boolean(user) && roles.includes(user.role), [user])
  const defaultPreferences = useMemo(() => ({ ...defaultUserPreferences, ...user?.preferences }), [user])
  const preferences = useMemo(() => ({ ...defaultPreferences, ...(localPreferences[user?.id] || {}) }), [defaultPreferences, localPreferences, user])
  const updatePreferences = useCallback((next) => {
    if (!user) return { ok: false }
    const saved = { ...localPreferences, [user.id]: next }
    try { localStorage.setItem('vantrix.preferences', JSON.stringify(saved)) }
    catch { return { ok: false } }
    setLocalPreferences(saved)
    return { ok: true }
  }, [user, localPreferences])

  const value = {
    user, loading, isAuthenticated: Boolean(user), signOutReason, login, logout,
    hasPermission, hasRole, sessionStartedAt: authenticated?.session.signedInAt || null,
    activity: [], preferences, defaultPreferences, updatePreferences,
    updateProfile: unavailable, changePassword: unavailable, register: unavailable,
    requestPasswordReset: unavailable, resetPassword: unavailable,
    isEmailTaken: unchecked, isUsernameTaken: unchecked,
  }
  return (
    <AuthContext.Provider value={value}>
      {children}
      {user && <InactivityGuard key={user.id} onTimeout={logoutForInactivity} onSignOut={logout} />}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider.')
  return context
}
export { AuthProvider }

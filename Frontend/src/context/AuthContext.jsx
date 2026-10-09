import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authUsers, defaultUserPreferences, mockUsers } from '../data/mockUsers'
import { hasPermission as roleHasPermission } from '../auth/permissions'
import InactivityGuard from '../components/auth/InactivityGuard'
import { describeDevice } from '../components/profile/profileFormat'

// Frontend-only mock authentication. No backend, API or token handling —
// this will be replaced by real auth once the backend exists.
// Authorization helpers exposed here are a UX guard only; the backend must
// enforce permissions for real.

const SESSION_KEY = 'vantrix.session'
const ACCOUNTS_KEY = 'vantrix.authAccounts'
const PREFERENCES_KEY = 'vantrix.preferences'
const LOGIN_DELAY_MS = 600
const ACTION_DELAY_MS = 700
const PROFILE_DELAY_MS = 500
const INACTIVITY_NOTICE = 'You were signed out due to inactivity. Sign in again to continue.'

const AuthContext = createContext(null)

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readStorage(storage, key) {
  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStorage(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage may be unavailable (private mode, blocked site data).
  }
}

function clearStorage(storage, key) {
  try {
    storage.removeItem(key)
  } catch {
    // Ignore — nothing to clear if storage is unavailable.
  }
}

function getStorage(name) {
  try {
    return window[name]
  } catch {
    return null
  }
}

function clearSession() {
  const local = getStorage('localStorage')
  const session = getStorage('sessionStorage')
  if (local) clearStorage(local, SESSION_KEY)
  if (session) clearStorage(session, SESSION_KEY)
}

// DEMO ONLY: a small non-reversible hash (FNV-1a) so raw passwords never reach
// localStorage. It is NOT secure — the backend will handle real password
// hashing (bcrypt/argon2) and verification.
function demoHash(userId, password) {
  const input = `vantrix-demo:${userId}:${password}`
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `demo-fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

// Persisted mock data: accounts created through sign-up (no passwords), demo
// password hashes for any account whose password was set or reset, and
// self-service profile edits (name, email, phone) keyed by user id.
function loadAccountStore() {
  const local = getStorage('localStorage')
  const stored = local ? readStorage(local, ACCOUNTS_KEY) : null
  return {
    registered: Array.isArray(stored?.registered) ? stored.registered : [],
    passwordHashes: isPlainObject(stored?.passwordHashes) ? stored.passwordHashes : {},
    profiles: isPlainObject(stored?.profiles) ? stored.profiles : {},
  }
}

function buildAccounts(store) {
  const registered = Array.isArray(store?.registered) ? store.registered : []
  const profiles = isPlainObject(store?.profiles) ? store.profiles : {}
  const passwordHashes = isPlainObject(store?.passwordHashes) ? store.passwordHashes : {}

  return [...authUsers, ...registered].map((account) => {
    const profile = profiles[account.id]
    const passwordHash = passwordHashes[account.id]
    return {
      ...account,
      ...(profile || {}),
      ...(passwordHash ? { passwordHash } : {}),
    }
  })
}

// Per-user POS preferences, keyed by user id.
function loadPreferenceStore() {
  const local = getStorage('localStorage')
  const stored = local ? readStorage(local, PREFERENCES_KEY) : null
  return isPlainObject(stored) ? stored : {}
}

function passwordMatches(account, password) {
  if (account.passwordHash) return account.passwordHash === demoHash(account.id, password)
  return account.demoPassword === password
}

// Never expose password data outside this module.
function toSessionUser(account) {
  // eslint-disable-next-line no-unused-vars
  const { demoPassword, passwordHash, ...user } = account
  return user
}

function isActive(account) {
  return account.status === 'Active'
}

function normalize(value) {
  return value.trim().toLowerCase()
}

function findByEmail(accounts, email) {
  const needle = normalize(email)
  return accounts.find((account) => account.email.toLowerCase() === needle)
}

function nextEmployeeCode(accounts) {
  const numbers = [...accounts.map((account) => account.employeeCode), ...mockUsers.map((user) => user.employeeId)]
    .map((code) => Number.parseInt(String(code).replace(/\D/g, ''), 10))
    .filter(Number.isFinite)
  return `EMP-${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`
}

// Async to mirror a future backend "current session" check.
function restoreSession() {
  return Promise.resolve().then(() => {
    const local = getStorage('localStorage')
    const session = getStorage('sessionStorage')
    const stored = (local && readStorage(local, SESSION_KEY)) || (session && readStorage(session, SESSION_KEY))
    if (!stored?.userId) return null

    const account = buildAccounts(loadAccountStore()).find((candidate) => candidate.id === stored.userId)
    if (!account || !isActive(account) || account.role !== stored.role) {
      clearSession()
      return null
    }
    return { user: toSessionUser(account), signedInAt: stored.signedInAt || null }
  })
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [signOutReason, setSignOutReason] = useState(null)
  const [accountStore, setAccountStore] = useState(loadAccountStore)
  const [preferenceStore, setPreferenceStore] = useState(loadPreferenceStore)
  const [sessionStartedAt, setSessionStartedAt] = useState(null)
  // Account activity recorded during this browser session (mock audit log).
  const [sessionActivity, setSessionActivity] = useState([])

  const accounts = useMemo(() => buildAccounts(accountStore), [accountStore])

  useEffect(() => {
    let cancelled = false
    restoreSession().then((restored) => {
      if (cancelled) return
      setUser(restored?.user ?? null)
      setSessionStartedAt(restored?.signedInAt ?? null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const local = getStorage('localStorage')
    if (local) writeStorage(local, ACCOUNTS_KEY, accountStore)
  }, [accountStore])

  useEffect(() => {
    const local = getStorage('localStorage')
    if (local) writeStorage(local, PREFERENCES_KEY, preferenceStore)
  }, [preferenceStore])

  const recordActivity = useCallback((userId, action, detail) => {
    setSessionActivity((current) => [
      { id: `${userId}-${Date.now()}-${current.length}`, userId, action, detail, at: new Date().toISOString() },
      ...current,
    ])
  }, [])

  // `excludeUserId` lets a user keep their own email when editing their profile.
  const isEmailTaken = useCallback(
    (email, excludeUserId) => {
      const needle = normalize(email)
      return (
        accounts.some((account) => account.id !== excludeUserId && account.email.toLowerCase() === needle) ||
        mockUsers.some((staff) => staff.id !== excludeUserId && staff.email.toLowerCase() === needle)
      )
    },
    [accounts],
  )

  const isUsernameTaken = useCallback(
    (username) => {
      const needle = normalize(username)
      return accounts.some((account) => account.username.toLowerCase() === needle)
    },
    [accounts],
  )

  const login = useCallback(
    async (identifier, password, rememberMe) => {
      await wait(LOGIN_DELAY_MS)

      const needle = normalize(identifier)
      const account = accounts.find(
        (candidate) => candidate.email.toLowerCase() === needle || candidate.username.toLowerCase() === needle,
      )

      if (!account || !passwordMatches(account, password)) {
        return { ok: false, error: 'Invalid email/username or password.' }
      }
      if (!isActive(account)) {
        return { ok: false, error: 'This account is inactive. Contact your administrator.' }
      }

      clearSession()
      const signedInAt = new Date().toISOString()
      const target = getStorage(rememberMe ? 'localStorage' : 'sessionStorage')
      if (target) writeStorage(target, SESSION_KEY, { userId: account.id, role: account.role, signedInAt })

      const sessionUser = toSessionUser(account)
      setSignOutReason(null)
      setSessionStartedAt(signedInAt)
      setUser(sessionUser)
      recordActivity(account.id, 'Signed in', describeDevice())
      return { ok: true, user: sessionUser }
    },
    [accounts, recordActivity],
  )

  const logout = useCallback(() => {
    clearSession()
    setSignOutReason(null)
    setSessionStartedAt(null)
    setSessionActivity([])
    setUser(null)
  }, [])

  // Signed out by the inactivity timer; the login page explains why.
  const logoutForInactivity = useCallback(() => {
    clearSession()
    setSignOutReason(INACTIVITY_NOTICE)
    setSessionStartedAt(null)
    setSessionActivity([])
    setUser(null)
  }, [])

  const hasPermission = useCallback((permission) => roleHasPermission(user, permission), [user])

  // Self-service profile edit for the signed-in user. Role, status, username
  // and employee code are deliberately not editable here.
  const updateProfile = useCallback(
    async ({ fullName, email, phone }) => {
      if (!user) return { ok: false, error: 'You are not signed in.' }
      await wait(PROFILE_DELAY_MS)

      const cleanEmail = email.trim().toLowerCase()
      if (isEmailTaken(cleanEmail, user.id)) {
        return { ok: false, fieldErrors: { email: 'Another account already uses this email.' } }
      }

      const changes = { fullName: fullName.trim(), email: cleanEmail, phone: phone.trim() }
      const changedLabels = [
        changes.fullName !== user.fullName && 'name',
        changes.email !== user.email && 'email',
        changes.phone !== (user.phone || '') && 'phone',
      ].filter(Boolean)

      setAccountStore((current) => ({
        ...current,
        profiles: { ...current.profiles, [user.id]: { ...(current.profiles[user.id] || {}), ...changes } },
      }))
      setUser((current) => (current ? { ...current, ...changes } : current))
      recordActivity(user.id, 'Profile updated', `Changed ${changedLabels.join(', ') || 'details'}`)
      return { ok: true }
    },
    [user, isEmailTaken, recordActivity],
  )

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      if (!user) return { ok: false, error: 'You are not signed in.' }
      await wait(ACTION_DELAY_MS)

      const account = accounts.find((candidate) => candidate.id === user.id)
      if (!account || !passwordMatches(account, currentPassword)) {
        return { ok: false, fieldErrors: { currentPassword: 'Current password is incorrect.' } }
      }
      if (currentPassword === newPassword) {
        return { ok: false, fieldErrors: { newPassword: 'New password must be different from your current password.' } }
      }

      setAccountStore((current) => ({
        ...current,
        passwordHashes: { ...current.passwordHashes, [user.id]: demoHash(user.id, newPassword) },
      }))
      recordActivity(user.id, 'Password changed', 'Changed from My Profile')
      return { ok: true }
    },
    [user, accounts, recordActivity],
  )

  const defaultPreferences = useMemo(() => ({ ...defaultUserPreferences, ...(user?.preferences || {}) }), [user])

  const preferences = useMemo(
    () => ({ ...defaultPreferences, ...((user && preferenceStore[user.id]) || {}) }),
    [defaultPreferences, preferenceStore, user],
  )

  const updatePreferences = useCallback(
    (next) => {
      if (!user) return { ok: false }
      setPreferenceStore((current) => ({ ...current, [user.id]: { ...next } }))
      recordActivity(user.id, 'Preferences updated', 'POS preferences saved')
      return { ok: true }
    },
    [user, recordActivity],
  )

  const activity = useMemo(
    () => (user ? sessionActivity.filter((entry) => entry.userId === user.id) : []),
    [sessionActivity, user],
  )

  const hasRole = useCallback((...roles) => Boolean(user) && roles.includes(user.role), [user])

  // Registers a new business and its first Admin. Does not sign the user in.
  const register = useCallback(
    async ({ business, admin }) => {
      await wait(ACTION_DELAY_MS)

      const fieldErrors = {}
      if (isEmailTaken(admin.email)) fieldErrors.email = 'An account with this email already exists.'
      if (isUsernameTaken(admin.username)) fieldErrors.username = 'This username is already taken.'
      if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }

      const id = `USR-${Date.now().toString(36).toUpperCase()}`
      const account = {
        id,
        employeeCode: nextEmployeeCode(accounts),
        fullName: admin.fullName.trim(),
        email: admin.email.trim().toLowerCase(),
        username: admin.username.trim(),
        role: 'Admin',
        status: 'Active',
        storeName: business.name.trim(),
        lastLogin: null,
        phone: business.phone.trim(),
        memberSince: new Date().toISOString(),
        avatarUrl: null,
        preferences: { ...defaultUserPreferences },
        business: {
          name: business.name.trim(),
          type: business.type,
          phone: business.phone.trim(),
          country: business.country,
          currency: business.currency,
        },
      }

      setAccountStore((current) => ({
        ...current,
        registered: [...(current?.registered || []), account],
        passwordHashes: { ...(current?.passwordHashes || {}), [id]: demoHash(id, admin.password) },
        profiles: { ...(current?.profiles || {}) },
      }))

      return { ok: true, user: toSessionUser(account) }
    },
    [accounts, isEmailTaken, isUsernameTaken],
  )

  // Always resolves the same way so the UI cannot reveal whether an email exists.
  const requestPasswordReset = useCallback(async () => {
    await wait(ACTION_DELAY_MS)
    return { ok: true }
  }, [])

  // Mock of following a reset link for `email`.
  const resetPassword = useCallback(
    async (email, newPassword) => {
      await wait(ACTION_DELAY_MS)

      const account = findByEmail(accounts, email)
      if (!account) {
        return { ok: false, error: 'This reset link is invalid or has expired. Request a new one.' }
      }

      setAccountStore((current) => ({
        ...current,
        passwordHashes: { ...current.passwordHashes, [account.id]: demoHash(account.id, newPassword) },
      }))
      return { ok: true, email: account.email }
    },
    [accounts],
  )

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      loading,
      signOutReason,
      login,
      logout,
      register,
      requestPasswordReset,
      resetPassword,
      isEmailTaken,
      isUsernameTaken,
      hasPermission,
      hasRole,
      sessionStartedAt,
      activity,
      preferences,
      defaultPreferences,
      updateProfile,
      changePassword,
      updatePreferences,
    }),
    [
      user,
      loading,
      signOutReason,
      sessionStartedAt,
      activity,
      preferences,
      defaultPreferences,
      updateProfile,
      changePassword,
      updatePreferences,
      login,
      logout,
      register,
      requestPasswordReset,
      resetPassword,
      isEmailTaken,
      isUsernameTaken,
      hasPermission,
      hasRole,
    ],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      {/* Keyed by user so the idle timer restarts for each new session. */}
      {user && <InactivityGuard key={user.id} onTimeout={logoutForInactivity} onSignOut={logout} />}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.')
  }
  return context
}

export { AuthProvider }

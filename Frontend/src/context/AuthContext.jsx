import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authUsers, defaultUserPreferences } from '../data/mockUsers'
import { hasPermission as roleHasPermission } from '../auth/permissions'
import InactivityGuard from '../components/auth/InactivityGuard'
import { describeDevice } from '../components/profile/profileFormat'
import {
  getCurrentUser,
  getSetupStatus,
  loginWithBackend,
  signupWithBackend,
  updateStaffUser,
} from '../services/api'

const SESSION_KEY = 'vantrix.session'
const ACCOUNTS_KEY = 'vantrix.authAccounts'
const PREFERENCES_KEY = 'vantrix.preferences'
const ACTION_DELAY_MS = 400
const PROFILE_DELAY_MS = 400
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

/**
 * Normalizes a user profile returned from the Backend API (`/api/auth/login` or `/api/auth/me`)
 * so that all Frontend components receive `user.role` as a string ("Admin", "Manager", "Cashier")
 * while preserving role metadata (`roleId`, `roleCode`, `roleObj`) and `permissions`.
 */
function normalizeBackendUser(rawUser) {
  if (!rawUser) return null

  const roleObj = isPlainObject(rawUser.role) ? rawUser.role : null
  const roleString =
    typeof rawUser.role === 'string' && rawUser.role
      ? rawUser.role
      : rawUser.roleName || roleObj?.name || 'Staff'

  return {
    ...rawUser,
    id: rawUser.id,
    employeeCode: rawUser.employeeCode || 'EMP-001',
    fullName: rawUser.fullName || rawUser.username || 'Staff User',
    email: rawUser.email || '',
    username: rawUser.username || '',
    role: roleString,
    roleName: roleString,
    roleId: rawUser.roleId || roleObj?.id || null,
    roleCode: rawUser.roleCode || roleObj?.code || null,
    roleObj,
    status: rawUser.status || (rawUser.isActive === false ? 'Inactive' : 'Active'),
    isActive: rawUser.isActive !== false,
    storeId: rawUser.storeId || rawUser.store?.id || null,
    storeName: rawUser.storeName || rawUser.store?.name || rawUser.business?.name || 'Main Store',
    lastLogin: rawUser.lastLogin || rawUser.lastLoginAt || null,
    phone: rawUser.phone || '',
    memberSince: rawUser.memberSince || rawUser.createdAt || new Date().toISOString(),
    avatarUrl: rawUser.avatarUrl || null,
    permissions: Array.isArray(rawUser.permissions) ? rawUser.permissions : undefined,
    preferences: { ...defaultUserPreferences, ...(rawUser.preferences || {}) },
    business: rawUser.business || null,
  }
}

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

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function findByEmail(accounts, email) {
  const needle = normalize(email)
  return accounts.find((account) => account.email.toLowerCase() === needle)
}

/**
 * Restores an authenticated session from browser storage and verifies it with `/api/auth/me`.
 */
async function restoreSession() {
  const local = getStorage('localStorage')
  const session = getStorage('sessionStorage')
  const localStored = local ? readStorage(local, SESSION_KEY) : null
  const sessionStored = session ? readStorage(session, SESSION_KEY) : null
  const stored = localStored || sessionStored
  const activeStorage = localStored ? local : session

  // Clear any legacy mock session that lacks a real Supabase JWT accessToken
  if (!stored || !stored.accessToken) {
    if (stored) clearSession()
    return null
  }

  try {
    const res = await getCurrentUser()
    if (res.ok && res.data?.success && res.data?.user) {
      const freshUser = normalizeBackendUser(res.data.user)
      if (activeStorage) {
        writeStorage(activeStorage, SESSION_KEY, {
          ...stored,
          userId: freshUser.id,
          role: freshUser.role,
          user: freshUser,
        })
      }
      return { user: freshUser, signedInAt: stored.signedInAt || null }
    }

    // If token is invalid/expired or user was deactivated, sign out cleanly
    if (res.status === 401 || res.status === 403) {
      clearSession()
      return null
    }

    // If backend is temporarily unreachable (status 0) and we have a cached user profile, keep session alive
    if (stored.user) {
      return { user: normalizeBackendUser(stored.user), signedInAt: stored.signedInAt || null }
    }
  } catch {
    if (stored.user) {
      return { user: normalizeBackendUser(stored.user), signedInAt: stored.signedInAt || null }
    }
  }

  clearSession()
  return null
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isSetupComplete, setIsSetupComplete] = useState(true)
  const [setupStatusLoaded, setSetupStatusLoaded] = useState(false)
  const [signOutReason, setSignOutReason] = useState(null)
  const [accountStore, setAccountStore] = useState(loadAccountStore)
  const [preferenceStore, setPreferenceStore] = useState(loadPreferenceStore)
  const [sessionStartedAt, setSessionStartedAt] = useState(null)
  // Account activity recorded during this browser session.
  const [sessionActivity, setSessionActivity] = useState([])

  const accounts = useMemo(() => buildAccounts(accountStore), [accountStore])

  const refreshSetupStatus = useCallback(async () => {
    try {
      const res = await getSetupStatus()
      if (res.ok && res.data && typeof res.data.isSetupComplete === 'boolean') {
        setIsSetupComplete(res.data.isSetupComplete)
      }
    } catch {
      // Ignore network errors and keep safe default
    } finally {
      setSetupStatusLoaded(true)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.all([restoreSession(), refreshSetupStatus()]).then(([restored]) => {
      if (cancelled) return
      setUser(restored?.user ?? null)
      setSessionStartedAt(restored?.signedInAt ?? null)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [refreshSetupStatus])

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

  // Uniqueness is validated authoritatively by the Backend database.
  const isEmailTaken = useCallback(() => false, [])
  const isUsernameTaken = useCallback(() => false, [])

  const login = useCallback(
    async (identifier, password, rememberMe) => {
      const cleanIdentifier = String(identifier || '').trim()
      if (!cleanIdentifier || !password) {
        return { ok: false, error: 'Enter your email or username and your password.' }
      }

      const res = await loginWithBackend({
        identifier: cleanIdentifier,
        password,
      })

      if (!res.ok || !res.data?.success || !res.data?.session || !res.data?.user) {
        return {
          ok: false,
          error: res.data?.error || res.data?.message || res.error || 'Invalid email/username or password.',
        }
      }

      const sessionUser = normalizeBackendUser(res.data.user)
      const signedInAt = new Date().toISOString()

      clearSession()
      const target = getStorage(rememberMe ? 'localStorage' : 'sessionStorage')
      if (target) {
        writeStorage(target, SESSION_KEY, {
          accessToken: res.data.session.accessToken,
          refreshToken: res.data.session.refreshToken,
          expiresAt: res.data.session.expiresAt,
          userId: sessionUser.id,
          role: sessionUser.role,
          signedInAt,
          user: sessionUser,
        })
      }

      setSignOutReason(null)
      setSessionStartedAt(signedInAt)
      setUser(sessionUser)
      recordActivity(sessionUser.id, 'Signed in', describeDevice())
      return { ok: true, user: sessionUser }
    },
    [recordActivity],
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

  // Self-service profile edit for the signed-in user.
  const updateProfile = useCallback(
    async ({ fullName, email, phone }) => {
      if (!user) return { ok: false, error: 'You are not signed in.' }

      const cleanEmail = email.trim().toLowerCase()
      const changes = { fullName: fullName.trim(), email: cleanEmail, phone: phone.trim() }

      try {
        const res = await updateStaffUser(user.id, {
          fullName: changes.fullName,
          phone: changes.phone,
        })
        if (!res.ok && res.status !== 403 && res.status !== 404) {
          return { ok: false, error: res.data?.error || res.data?.message || 'Failed to update profile.' }
        }
      } catch {
        // Fallback to local state update
      }

      const changedLabels = [
        changes.fullName !== user.fullName && 'name',
        changes.email !== user.email && 'email',
        changes.phone !== (user.phone || '') && 'phone',
      ].filter(Boolean)

      setAccountStore((current) => ({
        ...current,
        profiles: { ...current.profiles, [user.id]: { ...(current.profiles[user.id] || {}), ...changes } },
      }))
      setUser((current) => {
        if (!current) return current
        const nextUser = { ...current, ...changes }
        const local = getStorage('localStorage')
        const session = getStorage('sessionStorage')
        for (const storage of [local, session]) {
          if (!storage) continue
          const existing = readStorage(storage, SESSION_KEY)
          if (existing?.accessToken) {
            writeStorage(storage, SESSION_KEY, { ...existing, user: nextUser })
          }
        }
        return nextUser
      })
      recordActivity(user.id, 'Profile updated', `Changed ${changedLabels.join(', ') || 'details'}`)
      return { ok: true }
    },
    [user, recordActivity],
  )

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      if (!user) return { ok: false, error: 'You are not signed in.' }
      await wait(ACTION_DELAY_MS)

      if (currentPassword === newPassword) {
        return { ok: false, fieldErrors: { newPassword: 'New password must be different from your current password.' } }
      }

      recordActivity(user.id, 'Password changed', 'Changed from My Profile')
      return { ok: true }
    },
    [user, recordActivity],
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

  // Registers the initial business and its first Admin account via `/api/auth/signup`.
  const register = useCallback(
    async ({ business, admin }) => {
      const payload = {
        businessName: business.name.trim(),
        businessType: business.type,
        businessPhone: business.phone.trim(),
        country: business.country,
        currency: business.currency,
        fullName: admin.fullName.trim(),
        email: admin.email.trim().toLowerCase(),
        username: admin.username.trim(),
        password: admin.password,
        agreeTerms: true,
      }

      const res = await signupWithBackend(payload)

      if (!res.ok || !res.data?.success) {
        return {
          ok: false,
          error: res.data?.error || res.data?.message || res.error || 'Could not create administrator account.',
          fieldErrors: res.data?.fields || {},
        }
      }

      setIsSetupComplete(true)

      const createdUser = {
        email: payload.email,
        fullName: payload.fullName,
        username: payload.username,
        role: 'Admin',
        storeName: payload.businessName,
      }

      return {
        ok: true,
        emailConfirmationRequired: Boolean(res.data.emailConfirmationRequired),
        user: createdUser,
      }
    },
    [],
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
      isSetupComplete,
      setupStatusLoaded,
      refreshSetupStatus,
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
      isSetupComplete,
      setupStatusLoaded,
      refreshSetupStatus,
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

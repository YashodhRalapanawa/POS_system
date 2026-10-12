export const SESSION_KEY = 'vantrix.session'
export const SESSION_EXPIRED_EVENT = 'vantrix:session-expired'

export function readSession(browser = globalThis.window, now = Date.now()) {
  for (const name of ['localStorage', 'sessionStorage']) {
    try {
      const value = JSON.parse(browser?.[name]?.getItem(SESSION_KEY) || 'null')
      if (typeof value?.accessToken === 'string' && value.accessToken &&
          Number.isFinite(value.expiresAt) && value.expiresAt * 1000 > now) return value
    } catch { /* Storage may be blocked or contain an old malformed session. */ }
  }
  return null
}

export function clearSession(browser = globalThis.window) {
  for (const name of ['localStorage', 'sessionStorage']) {
    try { browser?.[name]?.removeItem(SESSION_KEY) } catch { /* Best effort. */ }
  }
}

export function normalizeStaff(profile) {
  if (!profile?.id || profile.status !== 'Active' || profile.isActive === false) return null
  const role = typeof profile.role === 'object' ? profile.role?.name : profile.role
  if (!role) return null
  return { ...profile, role, roleCode: profile.roleCode || profile.role?.code,
    permissions: Array.isArray(profile.permissions) ? profile.permissions : [] }
}

// A bounded access-token session. Refresh tokens and passwords are never persisted.
export function createAuthClient(request, browser = globalThis.window) {
  let generation = 0
  const logout = () => { generation += 1; clearSession(browser) }
  return {
    logout,
    invalidate: () => { generation += 1 },
    async login(identifier, password, rememberMe) {
      const attempt = ++generation
      const response = await request('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ identifier: identifier.trim(), password }),
      })
      if (attempt !== generation) return { ok: false, error: 'Sign-in was cancelled.' }
      const user = normalizeStaff(response.data?.user)
      const session = response.data?.session
      if (!response.ok || !response.data?.success || !user || !session?.accessToken ||
          !Number.isFinite(session.expiresAt) || session.expiresAt * 1000 <= Date.now()) {
        return { ok: false, error: response.data?.error || response.data?.message || response.error || 'Unable to sign in with this account.' }
      }
      clearSession(browser)
      const saved = { accessToken: session.accessToken, expiresAt: session.expiresAt, signedInAt: new Date().toISOString() }
      try {
        const storage = browser[rememberMe ? 'localStorage' : 'sessionStorage']
        storage.setItem(SESSION_KEY, JSON.stringify(saved))
      } catch {
        clearSession(browser)
        return { ok: false, error: 'Allow browser storage before signing in.' }
      }
      return { ok: true, user, session: saved }
    },
    async restore() {
      const attempt = generation
      const session = readSession(browser)
      if (!session) { clearSession(browser); return null }
      const response = await request('/api/auth/me', { headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store' })
      if (attempt !== generation) return null
      const user = normalizeStaff(response.data?.user || response.data?.data?.user)
      if (!response.ok || !response.data?.success || !user || !readSession(browser)) {
        clearSession(browser)
        return null
      }
      return { user, session }
    },
  }
}

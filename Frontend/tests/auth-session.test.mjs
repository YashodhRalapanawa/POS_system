import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAuthClient, readSession, SESSION_KEY } from '../src/services/authSession.mjs'

const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
const browser = () => ({ localStorage: storage(), sessionStorage: storage() })
const user = { id: 'staff-1', status: 'Active', isActive: true, role: { name: 'Cashier', code: 'CASHIER' }, permissions: ['invoices.view'] }
const session = () => ({ accessToken: 'test-token', refreshToken: 'must-not-persist', expiresAt: Math.floor(Date.now() / 1000) + 3600 })
const success = () => ({ ok: true, data: { success: true, user, session: session() } })

test('real login sends credentials to the API, normalizes role and stores only bounded session', async () => {
  const b = browser()
  const client = createAuthClient(async (path, options) => {
    assert.equal(path, '/api/auth/login')
    assert.deepEqual(JSON.parse(options.body), { identifier: 'staff@example.test', password: 'secret' })
    return success()
  }, b)
  const result = await client.login(' staff@example.test ', 'secret', false)
  assert.equal(result.ok, true)
  assert.equal(result.user.role, 'Cashier')
  assert.deepEqual(result.user.permissions, ['invoices.view'])
  assert.equal(b.localStorage.getItem(SESSION_KEY), null)
  assert.equal(readSession(b).accessToken, 'test-token')
  assert.doesNotMatch(b.sessionStorage.getItem(SESSION_KEY), /secret|refreshToken|must-not-persist/)
})
test('remember me uses local storage and clears the previous session', async () => {
  const b = browser()
  b.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session()))
  await createAuthClient(async () => success(), b).login('staff', 'secret', true)
  assert.ok(b.localStorage.getItem(SESSION_KEY))
  assert.equal(b.sessionStorage.getItem(SESSION_KEY), null)
})
test('bad password, inactive staff and malformed responses cannot establish a session', async () => {
  for (const response of [
    { ok: false, data: { error: 'Incorrect password' } },
    { ...success(), data: { ...success().data, user: { ...user, status: 'Inactive' } } },
    { ok: true, data: { success: true } },
    { ...success(), data: { ...success().data, session: { ...session(), expiresAt: 1 } } },
  ]) {
    const b = browser()
    const result = await createAuthClient(async () => response, b).login('staff', 'secret', false)
    assert.equal(result.ok, false)
    assert.equal(readSession(b), null)
  }
})
test('page reload verifies token with /me instead of trusting a stored profile', async () => {
  const b = browser()
  b.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...session(), user: { role: 'Admin' } }))
  const result = await createAuthClient(async (path, options) => {
    assert.equal(path, '/api/auth/me')
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    return { ok: true, data: { success: true, data: { user } } }
  }, b).restore()
  assert.equal(result.user.role, 'Cashier')
})
test('legacy demo, malformed and expired sessions are discarded without calling API', async () => {
  for (const stored of ['{', JSON.stringify({ userId: 'demo', role: 'Admin' }), JSON.stringify({ ...session(), expiresAt: 1 })]) {
    const b = browser()
    b.localStorage.setItem(SESSION_KEY, stored)
    const result = await createAuthClient(async () => assert.fail('must not call API'), b).restore()
    assert.equal(result, null)
    assert.equal(b.localStorage.getItem(SESSION_KEY), null)
  }
})
test('rejected /me response clears saved token', async () => {
  const b = browser()
  b.localStorage.setItem(SESSION_KEY, JSON.stringify(session()))
  assert.equal(await createAuthClient(async () => ({ ok: false, status: 401 }), b).restore(), null)
  assert.equal(readSession(b), null)
})
test('logout prevents pending login from recreating the session', async () => {
  const b = browser()
  let complete
  const client = createAuthClient(() => new Promise(resolve => { complete = resolve }), b)
  const pending = client.login('staff', 'secret', true)
  client.logout()
  complete(success())
  assert.equal((await pending).ok, false)
  assert.equal(readSession(b), null)
})
test('blocked storage shows an error instead of a false successful login', async () => {
  const b = browser()
  b.sessionStorage.setItem = () => { throw new Error('blocked') }
  const result = await createAuthClient(async () => success(), b).login('staff', 'secret', false)
  assert.equal(result.ok, false)
  assert.match(result.error, /storage/)
})
test('logout clears both storage locations', () => {
  const b = browser()
  b.localStorage.setItem(SESSION_KEY, JSON.stringify(session()))
  b.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session()))
  createAuthClient(async () => success(), b).logout()
  assert.equal(readSession(b), null)
})

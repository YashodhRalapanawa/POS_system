import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiFetch, getAuthToken, getInvoices } from '../src/services/api.js'
import { SESSION_KEY, SESSION_EXPIRED_EVENT, clearSession } from '../src/services/authSession.mjs'
import { hasPermission } from '../src/auth/permissionCheck.mjs'

function setup(t) {
  const originalWindow = globalThis.window
  const originalFetch = globalThis.fetch
  const store = () => {
    const values = new Map()
    return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  }
  const browser = new EventTarget()
  browser.localStorage = store()
  browser.sessionStorage = store()
  globalThis.window = browser
  t.after(() => { globalThis.window = originalWindow; globalThis.fetch = originalFetch })
  browser.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: 'invoice-token', expiresAt: Date.now() / 1000 + 3600 }))
  return browser
}

test('invoice request includes active session bearer token; logout removes it even if unrelated Supabase session remains', async t => {
  const browser = setup(t)
  const headers = []
  globalThis.fetch = async (url, options) => {
    assert.match(url, /^\/api\/invoices/)
    headers.push(options.headers.get('Authorization'))
    return Response.json({ success: true, data: { invoices: [] } })
  }
  await getInvoices()
  browser.localStorage.setItem('sb-other-auth-token', JSON.stringify({ access_token: 'unrelated' }))
  clearSession()
  await getInvoices()
  assert.deepEqual(headers, ['Bearer invoice-token', null])
  assert.equal(getAuthToken(), null)
})
test('protected API 401 notifies session guard; ordinary 403 does not log user out', async t => {
  const browser = setup(t)
  let expired = 0
  browser.addEventListener(SESSION_EXPIRED_EVENT, () => { expired += 1 })
  globalThis.fetch = async () => Response.json({ message: 'Forbidden' }, { status: 403 })
  await getInvoices()
  assert.equal(expired, 0)
  globalThis.fetch = async () => Response.json({ message: 'Expired' }, { status: 401 })
  await getInvoices()
  assert.equal(expired, 1)
  await apiFetch('/api/auth/login', { method: 'POST' })
  assert.equal(expired, 1)
})
test('permissions use server grants, without expanding empty or partial Manager/Cashier permissions', () => {
  for (const role of ['Manager', 'Cashier']) {
    assert.equal(hasPermission({ role, status: 'Active', permissions: [] }, 'invoices.view'), false)
    assert.equal(hasPermission({ role, status: 'Active', permissions: ['invoices.view'] }, 'invoices.view'), true)
    assert.equal(hasPermission({ role, status: 'Active', permissions: ['products.view'] }, 'invoices.view'), false)
  }
  assert.equal(hasPermission({ role: 'Admin', status: 'Active' }, 'invoices.view'), true)
  assert.equal(hasPermission({ role: 'Admin', status: 'Inactive' }, 'invoices.view'), false)
})

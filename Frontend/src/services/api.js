/**
 * API Service Utility for POS System
 * Configured with VITE_API_BASE_URL and automatic Bearer token authentication.
 */

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
export const API_BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl

/**
 * Retrieves the current session's Supabase access token from browser storage.
 */
export function getAuthToken() {
  if (typeof window === 'undefined') return null

  try {
    // 1. Check vantrix session storage
    for (const storage of [window.localStorage, window.sessionStorage]) {
      if (!storage) continue
      const raw = storage.getItem('vantrix.session')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.accessToken) return parsed.accessToken
        if (parsed?.token) return parsed.token
      }
    }

    // 2. Check Supabase client default storage (sb-<ref>-auth-token)
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const raw = window.localStorage.getItem(key)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed?.access_token) return parsed.access_token
        }
      }
    }
  } catch {
    // Storage access unavailable
  }

  return null
}

function getRefreshToken() {
  if (typeof window === 'undefined') return null
  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      if (!storage) continue
      const raw = storage.getItem('vantrix.session')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.refreshToken) return parsed.refreshToken
      }
    }
  } catch {}
  return null
}

function saveRefreshedSession(newSession) {
  if (typeof window === 'undefined' || !newSession?.accessToken) return
  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      if (!storage) continue
      const raw = storage.getItem('vantrix.session')
      if (raw) {
        const parsed = JSON.parse(raw)
        storage.setItem(
          'vantrix.session',
          JSON.stringify({
            ...parsed,
            accessToken: newSession.accessToken,
            refreshToken: newSession.refreshToken || parsed.refreshToken,
            expiresAt: newSession.expiresAt || parsed.expiresAt,
          }),
        )
      }
    }
  } catch {}
}

let refreshPromise = null

async function tryRefreshAccessToken() {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return null

  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.success && data?.session?.accessToken) {
        saveRefreshedSession(data.session)
        return data.session.accessToken
      }
    } catch {}
    return null
  })().finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

/**
 * Base fetch wrapper with auth header injection, automatic token refresh, and robust error handling.
 */
export async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`
  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getAuthToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  try {
    let response = await fetch(url, {
      ...options,
      headers,
    })

    // Automatically refresh expired token on 401 and retry once
    if (
      response.status === 401 &&
      !options._retried &&
      endpoint !== '/api/auth/login' &&
      endpoint !== '/api/auth/refresh'
    ) {
      const newAccessToken = await tryRefreshAccessToken()
      if (newAccessToken) {
        const retryHeaders = new Headers(options.headers || {})
        if (!retryHeaders.has('Content-Type') && !(options.body instanceof FormData)) {
          retryHeaders.set('Content-Type', 'application/json')
        }
        retryHeaders.set('Authorization', `Bearer ${newAccessToken}`)
        response = await fetch(url, {
          ...options,
          headers: retryHeaders,
          _retried: true,
        })
      }
    }

    const data = await response.json().catch(() => null)

    return {
      ok: response.ok,
      status: response.status,
      data,
      headers: response.headers,
    }
  } catch (networkError) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: networkError.message || 'Network error: could not connect to server.',
    }
  }
}

/**
 * Authentication & Setup APIs
 */

export async function getSetupStatus() {
  return apiFetch('/api/auth/setup-status', { method: 'GET' })
}

export async function loginWithBackend(credentials) {
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export async function signupWithBackend(signupData) {
  return apiFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(signupData),
  })
}

export async function getCurrentUser() {
  return apiFetch('/api/auth/me', { method: 'GET' })
}

/**
 * Staff and User APIs
 */

export async function getUsers(params = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status && params.status !== 'All Status') query.set('status', params.status)
  if (params.role && params.role !== 'All Roles') query.set('role', params.role)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))

  const queryString = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/users${queryString}`, { method: 'GET' })
}

export async function getRoles() {
  return apiFetch('/api/roles', { method: 'GET' })
}

export async function createStaffUser(userData) {
  return apiFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  })
}

export async function updateStaffRole(userId, roleId) {
  return apiFetch(`/api/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ roleId }),
  })
}

export async function updateStaffUser(userId, userData) {
  return apiFetch(`/api/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(userData),
  })
}

export async function updateStaffStatus(userId, statusData) {
  const payload = typeof statusData === 'boolean' ? { isActive: statusData } : statusData
  return apiFetch(`/api/users/${userId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/**
 * Product Category APIs
 */

export async function getCategories(params = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status && params.status !== 'All Status' && params.status !== 'All') query.set('status', params.status)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.all) query.set('all', 'true')

  const queryString = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/categories${queryString}`, { method: 'GET' })
}

export async function createCategory(categoryData) {
  return apiFetch('/api/categories', {
    method: 'POST',
    body: JSON.stringify(categoryData),
  })
}

export async function updateCategory(categoryId, categoryData) {
  return apiFetch(`/api/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(categoryData),
  })
}

export async function updateCategoryStatus(categoryId, isActive) {
  const payload = typeof isActive === 'boolean' ? { isActive } : isActive
  return apiFetch(`/api/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/**
 * Supplier APIs
 */

export async function getSuppliers(params = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status && params.status !== 'All Status' && params.status !== 'All') query.set('status', params.status)
  if (params.type && params.type !== 'All Types' && params.type !== 'All') query.set('type', params.type)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.all) query.set('all', 'true')

  const queryString = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/suppliers${queryString}`, { method: 'GET' })
}

export async function createSupplier(supplierData) {
  return apiFetch('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(supplierData),
  })
}

export async function updateSupplier(supplierId, supplierData) {
  return apiFetch(`/api/suppliers/${supplierId}`, {
    method: 'PATCH',
    body: JSON.stringify(supplierData),
  })
}

export async function updateSupplierStatus(supplierId, isActive) {
  const payload = typeof isActive === 'boolean' ? { isActive } : isActive
  return apiFetch(`/api/suppliers/${supplierId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/**
 * Customer APIs
 */

export async function getCustomers(params = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status && params.status !== 'All Status' && params.status !== 'All') query.set('status', params.status)
  if (params.type && params.type !== 'All Types' && params.type !== 'All') query.set('type', params.type)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.all) query.set('all', 'true')

  const queryString = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/customers${queryString}`, { method: 'GET' })
}

export async function getCustomerById(customerId) {
  return apiFetch(`/api/customers/${customerId}`, { method: 'GET' })
}

export async function createCustomer(customerData) {
  return apiFetch('/api/customers', {
    method: 'POST',
    body: JSON.stringify(customerData),
  })
}

export async function updateCustomer(customerId, customerData) {
  return apiFetch(`/api/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(customerData),
  })
}

export async function updateCustomerStatus(customerId, isActive) {
  const payload = typeof isActive === 'boolean' ? { isActive } : isActive
  return apiFetch(`/api/customers/${customerId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/**
 * Product APIs
 */

export async function getProducts(params = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.category && params.category !== 'All Categories' && params.category !== 'All') query.set('category', params.category)
  if (params.supplier && params.supplier !== 'All Suppliers' && params.supplier !== 'All') query.set('supplier', params.supplier)
  if (params.status && params.status !== 'All Status' && params.status !== 'All') query.set('status', params.status)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.all) query.set('all', 'true')

  const queryString = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/products${queryString}`, { method: 'GET' })
}

export async function getProductById(productId) {
  return apiFetch(`/api/products/${productId}`, { method: 'GET' })
}

export async function createProduct(productData) {
  return apiFetch('/api/products', {
    method: 'POST',
    body: JSON.stringify(productData),
  })
}

export async function updateProduct(productId, productData) {
  return apiFetch(`/api/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(productData),
  })
}

export async function updateProductStatus(productId, isActive) {
  const payload = typeof isActive === 'boolean' ? { isActive } : isActive
  return apiFetch(`/api/products/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function getProductByBarcode(barcode) {
  const encoded = encodeURIComponent(String(barcode).trim())
  return apiFetch(`/api/products/barcode/${encoded}`, { method: 'GET' })
}

/**
 * Inventory APIs
 */

export async function getInventory(params = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.storeId && params.storeId !== 'All Stores' && params.storeId !== 'All') query.set('storeId', params.storeId)
  if (params.categoryId && params.categoryId !== 'All Categories' && params.categoryId !== 'All') query.set('categoryId', params.categoryId)
  if (params.status && params.status !== 'All Status' && params.status !== 'All') query.set('status', params.status)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.all) query.set('all', 'true')

  const queryString = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/inventory${queryString}`, { method: 'GET' })
}

export async function getProductStock(productId) {
  return apiFetch(`/api/inventory/${productId}`, { method: 'GET' })
}

export async function createOpeningStock(data) {
  return apiFetch('/api/inventory/opening-stock', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function createStockAdjustment(data) {
  return apiFetch('/api/inventory/adjustments', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function getInventoryMovements(params = {}) {
  const query = new URLSearchParams()
  if (params.productId) query.set('productId', params.productId)
  if (params.storeId && params.storeId !== 'All Stores' && params.storeId !== 'All') query.set('storeId', params.storeId)
  if (params.movementType && params.movementType !== 'All Types' && params.movementType !== 'All') query.set('movementType', params.movementType)
  if (params.startDate) query.set('startDate', params.startDate)
  if (params.endDate) query.set('endDate', params.endDate)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))

  const queryString = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/inventory/movements${queryString}`, { method: 'GET' })
}

/**
 * POS Orders APIs
 */

export async function getPosOrders(params = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status && params.status !== 'All Status' && params.status !== 'All') query.set('status', params.status)
  if (params.storeId && params.storeId !== 'All Stores' && params.storeId !== 'All') query.set('storeId', params.storeId)
  if (params.dateFilter && params.dateFilter !== 'All Dates') query.set('date', params.dateFilter)
  if (params.startDate) query.set('startDate', params.startDate)
  if (params.endDate) query.set('endDate', params.endDate)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))

  const queryString = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/pos/orders${queryString}`, { method: 'GET' })
}

export async function getPosOrderById(orderId) {
  return apiFetch(`/api/pos/orders/${orderId}`, { method: 'GET' })
}

export async function createPosOrder(orderData, idempotencyKey = null) {
  const headers = {}
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }

  return apiFetch('/api/pos/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(orderData),
  })
}

export async function updatePosOrder(orderId, orderData) {
  return apiFetch(`/api/pos/orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify(orderData),
  })
}

export async function cancelPosOrder(orderId, reasonData = {}) {
  return apiFetch(`/api/pos/orders/${orderId}/cancel`, {
    method: 'POST',
    body: JSON.stringify(reasonData),
  })
}

export async function completePosOrder(orderId, payload = {}) {
  return apiFetch(`/api/pos/orders/${orderId}/complete`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * Task 19: Stock Availability and Stock Validation APIs
 */

export async function getStockAvailability({ storeId, productIds }) {
  const query = new URLSearchParams()
  if (storeId) query.set('storeId', storeId)
  if (Array.isArray(productIds)) {
    query.set('productIds', productIds.join(','))
  } else if (productIds) {
    query.set('productIds', String(productIds))
  }

  return apiFetch(`/api/inventory/availability?${query.toString()}`, { method: 'GET' })
}

export async function validatePosOrderStock(data) {
  return apiFetch('/api/pos/orders/validate-stock', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * Settings: Country & Currency APIs
 */
export async function getCountryCurrencySettings(storeId = null) {
  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''
  return apiFetch(`/api/settings/country-currency${query}`, { method: 'GET' })
}

export async function updateCountryCurrencySettings(data) {
  return apiFetch('/api/settings/country-currency', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/**
 * Developer 2: Taxes & Tax Configuration APIs
 */

export async function getTaxes(params = {}) {
  const query = new URLSearchParams()
  if (params.storeId) query.set('storeId', params.storeId)
  if (params.status) query.set('status', params.status)
  const qs = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/taxes${qs}`, { method: 'GET' })
}

export async function createTax(taxData) {
  return apiFetch('/api/taxes', {
    method: 'POST',
    body: JSON.stringify(taxData),
  })
}

export async function updateTax(taxId, taxData) {
  return apiFetch(`/api/taxes/${taxId}`, {
    method: 'PATCH',
    body: JSON.stringify(taxData),
  })
}

/**
 * Developer 2: Invoices APIs
 */

export async function getInvoices(params = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status && params.status !== 'All Status' && params.status !== 'All') query.set('status', params.status)
  if (params.paymentMethod && params.paymentMethod !== 'All Payment Methods' && params.paymentMethod !== 'All') {
    query.set('paymentMethod', params.paymentMethod)
  }
  if (params.customerType && params.customerType !== 'All Customer Types' && params.customerType !== 'All') {
    query.set('customerType', params.customerType)
  }
  if (params.dateFilter && params.dateFilter !== 'All Dates') query.set('date', params.dateFilter)
  if (params.startDate) query.set('startDate', params.startDate)
  if (params.endDate) query.set('endDate', params.endDate)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.all) query.set('all', 'true')

  const qs = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/invoices${qs}`, { method: 'GET' })
}

export async function getInvoiceById(invoiceId) {
  return apiFetch(`/api/invoices/${invoiceId}`, { method: 'GET' })
}

export async function createInvoice(invoiceData) {
  return apiFetch('/api/invoices', {
    method: 'POST',
    body: JSON.stringify(invoiceData),
  })
}

export async function updateInvoice(invoiceId, invoiceData) {
  return apiFetch(`/api/invoices/${invoiceId}`, {
    method: 'PATCH',
    body: JSON.stringify(invoiceData),
  })
}

export async function getInvoiceByOrderId(orderId) {
  return apiFetch(`/api/invoices/order/${orderId}`, { method: 'GET' })
}

/**
 * Developer 2: Payments & Receipts APIs
 */

export async function getPayments(params = {}) {
  const query = new URLSearchParams()
  if (params.orderId) query.set('orderId', params.orderId)
  if (params.invoiceId) query.set('invoiceId', params.invoiceId)
  if (params.method) query.set('method', params.method)
  if (params.status) query.set('status', params.status)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))

  const qs = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/payments${qs}`, { method: 'GET' })
}

export async function createPayment(paymentData) {
  return apiFetch('/api/payments', {
    method: 'POST',
    body: JSON.stringify(paymentData),
  })
}

export async function getPaymentById(paymentId) {
  return apiFetch(`/api/payments/${paymentId}`, { method: 'GET' })
}

export async function getPaymentsByInvoiceId(invoiceId) {
  return apiFetch(`/api/payments/invoice/${invoiceId}`, { method: 'GET' })
}

export async function getReceipt(invoiceId) {
  return apiFetch(`/api/receipts/${invoiceId}`, { method: 'GET' })
}

/**
 * Developer 2: Returns & Credit Notes APIs
 */

export async function getReturns(params = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status && params.status !== 'All Status' && params.status !== 'All') query.set('status', params.status)
  if (params.refundMethod && params.refundMethod !== 'All Refund Methods' && params.refundMethod !== 'All') {
    query.set('refundMethod', params.refundMethod)
  }
  if (params.reason && params.reason !== 'All Reasons' && params.reason !== 'All') query.set('reason', params.reason)
  if (params.dateFilter && params.dateFilter !== 'All Dates') query.set('date', params.dateFilter)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))
  if (params.all) query.set('all', 'true')

  const qs = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/returns${qs}`, { method: 'GET' })
}

export async function getReturnById(returnId) {
  return apiFetch(`/api/returns/${returnId}`, { method: 'GET' })
}

export async function createReturn(returnData) {
  return apiFetch('/api/returns', {
    method: 'POST',
    body: JSON.stringify(returnData),
  })
}

export async function updateReturnStatus(returnId, statusData) {
  return apiFetch(`/api/returns/${returnId}`, {
    method: 'PATCH',
    body: JSON.stringify(statusData),
  })
}

export async function getCreditNotes(params = {}) {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status) query.set('status', params.status)
  if (params.page) query.set('page', String(params.page))
  if (params.limit) query.set('limit', String(params.limit))

  const qs = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/credit-notes${qs}`, { method: 'GET' })
}

export async function getCreditNoteById(id) {
  return apiFetch(`/api/credit-notes/${id}`, { method: 'GET' })
}

export async function createCreditNote(creditNoteData) {
  return apiFetch('/api/credit-notes', {
    method: 'POST',
    body: JSON.stringify(creditNoteData),
  })
}

/**
 * Developer 2: Dashboard & Reports APIs
 */

export async function getDailyReport(params = {}) {
  const query = new URLSearchParams()
  if (params.date) query.set('date', params.date)
  if (params.storeId) query.set('storeId', params.storeId)
  const qs = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/reports/daily${qs}`, { method: 'GET' })
}

export const getDailySales = getDailyReport
export const getMonthlySales = getMonthlyReport

export async function getMonthlyReport(params = {}) {
  const query = new URLSearchParams()
  if (params.year) query.set('year', String(params.year))
  if (params.month) query.set('month', String(params.month))
  if (params.storeId) query.set('storeId', params.storeId)
  const qs = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/reports/monthly${qs}`, { method: 'GET' })
}

export async function getDashboardSummary(params = {}) {
  const query = new URLSearchParams()
  if (params.storeId) query.set('storeId', params.storeId)
  const qs = query.toString() ? `?${query.toString()}` : ''
  return apiFetch(`/api/dashboard/summary${qs}`, { method: 'GET' })
}






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

/**
 * Base fetch wrapper with auth header injection and robust error handling.
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
    const response = await fetch(url, {
      ...options,
      headers,
    })

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



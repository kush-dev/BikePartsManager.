
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'.replace(/\/$/, '')

async function request(path, options = {}) {
  let response

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })
  } catch {
    throw new Error(
      'Cannot reach the API. Check that the FastAPI server is running.'
    )
  }

  if (response.status === 204) return null

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const detail = data.detail
    throw new Error(
      typeof detail === 'string' ? detail : 'The request failed.'
    )
  }

  return data
}

// General application API
export const api = {
  health: () => request('/api/health'),

  getCategories: () => request('/api/categories'),

  createCategory: (payload) =>
    request('/api/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getProducts: (search = '') =>
    request(`/api/products?search=${encodeURIComponent(search)}`),

  createProduct: (payload) =>
    request('/api/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateProduct: (id, payload) =>
    request(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deactivateProduct: (id) =>
    request(`/api/products/${id}`, {
      method: 'DELETE',
    }),

  getInactiveProducts: () =>
    request('/api/products?include_inactive=true'),

  reactivateProduct: (id) =>
    request(`/api/products/${id}/reactivate`, {
      method: 'POST',
    }),
}

// Point of Sale and sales history
export const salesApi = {
  checkout: (payload) =>
    request('/api/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getRecentSales: (limit = 8) =>
    request(`/api/sales?limit=${limit}`),

  getTodaySummary: () =>
    request('/api/sales/summary/today'),

  getAnalytics: (days = 7) =>
    request(`/api/sales/analytics?days=${days}`),
}

// Stock movements
export const stockMovementsApi = {
  list: (filters = {}) => {
    const params = new URLSearchParams()

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value))
      }
    })

    const query = params.toString()

    return request(
      `/api/stock-movements${query ? `?${query}` : ''}`
    )
  },

  getSummary: () =>
    request('/api/stock-movements/summary'),

  create: (payload) =>
    request('/api/stock-movements', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}

// Reports
export const reportsApi = {
  getReport: (filters = {}) => {
    const params = new URLSearchParams()

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value))
      }
    })

    return request(
      `/api/reports${params.toString() ? `?${params.toString()}` : ''}`
    )
  },

  createEntry: (payload) =>
    request('/api/reports/entries', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}

// Restocking
export const restockingApi = {
  getBalance: () =>
    request('/api/reports/restocking/balance'),

  getEntries: () =>
    request('/api/reports/restocking'),

  createEntry: (payload) =>
    request('/api/reports/restocking', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}

// Authentication
export const authApi = {
  async login(credentials) {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.detail || 'Login failed.')
    }

    return data
  },

  async me() {
    const response = await fetch(`${API_BASE}/api/auth/me`, {
      credentials: 'include',
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.detail || 'Not authenticated.')
    }

    return data
  },

  async logout() {
    const response = await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.detail || 'Logout failed.')
    }

    return data
  },
}

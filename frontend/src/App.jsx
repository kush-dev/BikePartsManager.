
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  Activity,
  Bike,
  Boxes,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Tag,
  TrendingUp,
  TriangleAlert,
  Wrench,
  X,
  Pencil,
  Power,
  RefreshCw,
} from 'lucide-react'

import { authApi, api } from './services/api'
import Login from './components/Login'
import Modal from './components/Modal'
import Dashboard from './components/Dashboard'
import ProductForm from './components/ProductForm'
import CategoryManager from './components/CategoryManager'
import POS from './components/POS'
import StockMovements from './components/StockMovements'
import Reports from './components/Reports'
import Restocking from './components/Restocking'
import SettingsPage from './components/Settings'

const money = (value) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)

export default function App() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('bpm-theme') || 'light'
  )

  const [page, setPage] = useState('Dashboard')
  const [products, setProducts] = useState([])
  const [inactiveProducts, setInactiveProducts] = useState([])
  const [showInactive, setShowInactive] = useState(false)
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [modal, setModal] = useState(null)
  const [editing, setEditing] = useState(null)

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [apiStatus, setApiStatus] = useState('checking')
  const [mobileNav, setMobileNav] = useState(false)

  // Authentication
  const [authStatus, setAuthStatus] = useState('checking')
  const [currentUser, setCurrentUser] = useState(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // Theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('bpm-theme', theme)
  }, [theme])

  // Check existing authentication session
  useEffect(() => {
    let active = true

    async function checkAuthentication() {
      try {
        const result = await authApi.me()

        if (active) {
          setCurrentUser(result.user)
          setAuthStatus('authenticated')
        }
      } catch {
        if (active) {
          setCurrentUser(null)
          setAuthStatus('unauthenticated')
        }
      }
    }

    checkAuthentication()

    return () => {
      active = false
    }
  }, [])

  // Login
  async function handleLogin(credentials) {
    const result = await authApi.login(credentials)

    setCurrentUser(result.user)
    setPage('Dashboard')
    setAuthStatus('authenticated')
    setError('')
    setNotice('Welcome back.')
  }

  // Logout
  async function handleLogout() {
    try {
      await authApi.logout()

      setCurrentUser(null)
      setUserMenuOpen(false)
      setProducts([])
      setCategories([])
      setInactiveProducts([])
      setPage('Dashboard')
      setShowInactive(false)
      setSearch('')
      setCategoryFilter('all')
      setAuthStatus('unauthenticated')
      setError('')
      setNotice('')

      window.history.replaceState(null, '', window.location.pathname)
    } catch (err) {
      setError(err.message || 'Could not log out. Please try again.')
    }
  }

  // Load products and categories
  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [productData, categoryData] = await Promise.all([
        api.getProducts(),
        api.getCategories(),
      ])

      setProducts(productData)
      setCategories(categoryData)
      setApiStatus('connected')
    } catch (err) {
      setError(err.message)
      setApiStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load application data only after authentication
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      return
    }

    loadData()
  }, [authStatus, loadData])

  // Product filtering
  const displayedProducts = showInactive ? inactiveProducts : products

  const filteredProducts = useMemo(
    () =>
      displayedProducts.filter((p) => {
        const matchesCategory =
          categoryFilter === 'all' ||
          String(p.category_id) === categoryFilter

        return matchesCategory
      }),
    [displayedProducts, categoryFilter]
  )

  const visibleProducts = useMemo(
    () =>
      filteredProducts.filter((p) => {
        const q = search.trim().toLowerCase()

        return (
          !q ||
          [p.name, p.sku, p.brand, p.category_name].some((value) =>
            String(value || '').toLowerCase().includes(q)
          )
        )
      }),
    [filteredProducts, search]
  )

  // Inventory statistics
  const stats = useMemo(
    () => ({
      count: products.length,

      units: products.reduce(
        (sum, p) => sum + Number(p.quantity || 0),
        0
      ),

      stockValue: products.reduce(
        (sum, p) =>
          sum + Number(p.cost_price || 0) * Number(p.quantity || 0),
        0
      ),

      low: products.filter(
        (p) => Number(p.quantity) <= Number(p.reorder_level)
      ).length,
    }),
    [products]
  )

  // Notifications
  function flash(message) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }

  // Create category
  async function createCategory(payload) {
    setBusy(true)
    setError('')

    try {
      const category = await api.createCategory(payload)

      setCategories((old) =>
        [...old, category].sort((a, b) => a.name.localeCompare(b.name))
      )

      flash('Category created successfully.')
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  // Create or update product
  async function saveProduct(payload) {
    setBusy(true)
    setError('')

    try {
      if (editing) {
        const updated = await api.updateProduct(editing.id, payload)

        setProducts((old) =>
          old
            .map((p) => (p.id === updated.id ? updated : p))
            .sort((a, b) => a.name.localeCompare(b.name))
        )

        flash('Product updated successfully.')
      } else {
        const created = await api.createProduct(payload)

        setProducts((old) =>
          [...old, created].sort((a, b) => a.name.localeCompare(b.name))
        )

        flash('Product added successfully.')
      }

      setModal(null)
      setEditing(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Deactivate product
  async function deactivateProduct(product) {
    if (
      !window.confirm(
        `Deactivate "${product.name}"? It will be hidden from the active catalogue.`
      )
    ) {
      return
    }

    setError('')

    try {
      await api.deactivateProduct(product.id)

      setProducts((old) => old.filter((p) => p.id !== product.id))

      flash('Product deactivated.')
    } catch (err) {
      setError(err.message)
    }
  }

  // Load inactive products
  async function loadInactiveProducts() {
    setLoading(true)
    setError('')

    try {
      const allProducts = await api.getInactiveProducts()

      setInactiveProducts(
        allProducts.filter((product) => !product.is_active)
      )

      setShowInactive(true)
      setSearch('')
      setCategoryFilter('all')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Reactivate product
  async function reactivateProduct(product) {
    if (!window.confirm(`Reactivate "${product.name}"?`)) {
      return
    }

    setError('')

    try {
      const restored = await api.reactivateProduct(product.id)

      setInactiveProducts((old) =>
        old.filter((item) => item.id !== restored.id)
      )

      setProducts((old) =>
        [...old.filter((item) => item.id !== restored.id), restored].sort(
          (a, b) => a.name.localeCompare(b.name)
        )
      )

      flash(`"${restored.name}" has been reactivated.`)
    } catch (err) {
      setError(err.message)
    }
  }

  function showActiveProducts() {
    setShowInactive(false)
    setSearch('')
    setCategoryFilter('all')
  }

  // Navigation
  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard },
    { label: 'Point of sale', icon: CircleDollarSign },
    { label: 'Inventory', icon: Boxes },
    { label: 'Categories', icon: Tag },
    { label: 'Stock movements', icon: Activity },
    { label: 'Reports', icon: TrendingUp },
    { label: 'Settings', icon: Settings },
  ]

  function navigate(label, soon = false) {
    setMobileNav(false)

    if (soon) {
      flash(`${label} will be added in a later milestone.`)
      return
    }

    setPage(label)
  }

  // Authentication loading screen
  if (authStatus === 'checking') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="loading-state">
            <span className="spinner" />
            Checking your session...
          </div>
        </div>
      </div>
    )
  }

  // Login screen
  if (authStatus === 'unauthenticated') {
    return <Login onLogin={handleLogin} />
  }

  // Main application
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark">
            <Bike size={24} strokeWidth={2.3} />
          </div>

          <div>
            <strong>OnRoute Bike Spare Parts</strong>
            <span>MANAGER</span>
          </div>

          <button
            className="icon-button mobile-close"
            onClick={() => setMobileNav(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>

        <div className="shop-switcher">
          <div className="shop-avatar">BP</div>

          <div>
            <strong>Onroute Bike Spare Parts</strong>
            <span>Retail workspace</span>
          </div>

          <ChevronDown size={15} />
        </div>

        <div className="nav-caption">WORKSPACE</div>

        <nav className="nav-list">
          {navItems.map(({ label, icon: Icon, soon }) => (
            <button
              key={label}
              className={`nav-link ${page === label ? 'active' : ''}`}
              onClick={() => navigate(label, soon)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {soon && <span className="soon-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="connection-card">
            <span className={`connection-dot ${apiStatus}`} />

            <div>
              <strong>
                {apiStatus === 'connected'
                  ? 'System connected'
                  : apiStatus === 'checking'
                    ? 'Connecting…'
                    : 'Connection issue'}
              </strong>

              <span>
                {apiStatus === 'connected'
                  ? 'Database API ready'
                  : 'Local API status'}
              </span>
            </div>
          </div>

          <div className="user-card">
            <div className="user-avatar">
              <Wrench size={17} />
            </div>

            <div>
              <strong>{currentUser?.full_name || 'System Administrator'}</strong>
              <span>Production mode</span>
            </div>

            <ShieldCheck size={17} className="user-shield" />
          </div>
        </div>
      </aside>

      {mobileNav && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation overlay"
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileNav(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>

            <div className="breadcrumb">
              Workspace <span>/</span> <strong>{page}</strong>
            </div>
          </div>

          <div className="topbar-actions">
            <span className={`status-pill ${apiStatus}`}>
              <span className="connection-dot" />

              {apiStatus === 'connected'
                ? 'Connected'
                : apiStatus === 'checking'
                  ? 'Checking'
                  : 'Offline'}
            </span>

            <button
              className="icon-button theme-toggle"
              onClick={() =>
                setTheme((old) => (old === 'light' ? 'dark' : 'light'))
              }
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-label="Toggle light and dark mode"
            >
              {theme === 'light' ? (
                <Moon size={18} />
              ) : (
                <Sun size={18} />
              )}
            </button>

            <div className="user-menu-wrapper">
              <button
                type="button"
                className="top-avatar"
                onClick={() => setUserMenuOpen((value) => !value)}
                aria-label="Open account menu"
                aria-expanded={userMenuOpen}
              >
                {(currentUser?.full_name || 'A').charAt(0).toUpperCase()}
              </button>

              {userMenuOpen && (
                <div className="user-dropdown">
                  <div className="user-dropdown-info">
                    <strong>
                      {currentUser?.full_name || 'Administrator'}
                    </strong>
                    <span>{currentUser?.username || 'admin'}</span>
                  </div>

                  <div className="user-dropdown-divider" />

                  <button
                    type="button"
                    className="user-dropdown-logout"
                    onClick={handleLogout}
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-content">
          {error && (
            <div className="alert error-alert">
              <TriangleAlert size={18} />
              <span>{error}</span>

              <button
                className="icon-button"
                onClick={() => setError('')}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {notice && (
            <div className="toast">
              <Check size={17} />
              {notice}
            </div>
          )}

          {page === 'Dashboard' ? (
            <Dashboard
              products={products}
              categories={categories}
              onNavigate={setPage}
            />
          ) : page === 'Settings' ? (
            <SettingsPage
              theme={theme}
              onThemeChange={setTheme}
            />
          ) : page === 'Point of sale' ? (
            <POS products={products} onSaleCompleted={loadData} />
          ) : page === 'Stock movements' ? (
            <StockMovements
              products={products}
              onStockChanged={loadData}
            />
          ) : page === 'Reports' ? (
            <Reports />
          ) : page === 'Categories' ? (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">PRODUCT ORGANISATION</div>
                  <h1>Categories</h1>
                  <p>
                    Organise your spare parts into easy-to-find groups.
                  </p>
                </div>
              </section>

              <CategoryManager
                categories={categories}
                onCreate={createCategory}
                busy={busy}
              />
            </>
          ) : (
            <>
              <section className="page-heading inventory-heading">
                <div>
                  <div className="eyebrow">STOCK CONTROL</div>

                  <h1>
                    {showInactive ? 'Inactive Products' : 'Inventory'}
                  </h1>

                  <p>
                    {showInactive
                      ? 'View deactivated products and restore them to your active catalogue.'
                      : 'Manage your spare parts catalogue and keep stock levels under control.'}
                  </p>
                </div>

                {!showInactive && (
                  <button
                    className="button primary add-product"
                    onClick={() => {
                      setEditing(null)
                      setModal('product')
                    }}
                  >
                    <Plus size={17} /> Add product
                  </button>
                )}
              </section>

              {!showInactive && (
                <section className="stats-grid">
                  <StatCard
                    icon={Package}
                    label="Active products"
                    value={stats.count.toLocaleString()}
                    note="Items in your catalogue"
                    tone="blue"
                  />

                  <StatCard
                    icon={Boxes}
                    label="Units in stock"
                    value={stats.units.toLocaleString()}
                    note="Across all active products"
                    tone="violet"
                  />

                  <StatCard
                    icon={CircleDollarSign}
                    label="Stock cost value"
                    value={money(stats.stockValue)}
                    note="Based on purchase cost"
                    tone="green"
                  />

                  <StatCard
                    icon={TriangleAlert}
                    label="Low-stock items"
                    value={stats.low.toLocaleString()}
                    note="At or below reorder level"
                    tone="orange"
                  />
                </section>
              )}

              <section className="panel inventory-panel">
                <div className="inventory-toolbar">
                  <div>
                    <h2>
                      {showInactive
                        ? 'Inactive product catalogue'
                        : 'Product catalogue'}
                    </h2>

                    <p>
                      {showInactive
                        ? 'Reactivate products to make them available in active inventory and the POS.'
                        : 'Search by part name, SKU, brand or category.'}
                    </p>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {showInactive ? (
                      <button
                        className="button secondary"
                        onClick={showActiveProducts}
                      >
                        <Boxes size={15} /> Active inventory
                      </button>
                    ) : (
                      <button
                        className="button secondary"
                        onClick={loadInactiveProducts}
                        disabled={loading}
                      >
                        <Power size={15} /> Inactive products
                      </button>
                    )}

                    <button
                      className="button secondary refresh-button"
                      onClick={
                        showInactive ? loadInactiveProducts : loadData
                      }
                      disabled={loading}
                    >
                      <RefreshCw
                        size={15}
                        className={loading ? 'spin' : ''}
                      />
                      Refresh
                    </button>
                  </div>
                </div>

                <div className="filter-row">
                  <div className="search-box">
                    <Search size={19} />

                    <input
                      aria-label="Search products"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search products, SKU, brand…"
                    />

                    <kbd>⌕</kbd>
                  </div>

                  <select
                    aria-label="Filter by category"
                    className="filter-select"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">All categories</option>

                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {loading ? (
                  <div className="loading-state">
                    <span className="spinner" />
                    Loading products…
                  </div>
                ) : visibleProducts.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">
                      <Package size={26} />
                    </div>

                    <strong>
                      {showInactive
                        ? search || categoryFilter !== 'all'
                          ? 'No matching inactive products'
                          : 'No inactive products'
                        : search || categoryFilter !== 'all'
                          ? 'No matching products'
                          : 'Your catalogue is ready'}
                    </strong>

                    <span>
                      {showInactive
                        ? 'Deactivated products will appear here when available.'
                        : search || categoryFilter !== 'all'
                          ? 'Try a different search or category.'
                          : 'Add your first spare part to start building your inventory.'}
                    </span>

                    {!showInactive &&
                      !search &&
                      categoryFilter === 'all' && (
                        <button
                          className="button primary"
                          onClick={() => {
                            setEditing(null)
                            setModal('product')
                          }}
                        >
                          <Plus size={16} /> Add first product
                        </button>
                      )}
                  </div>
                ) : (
                  <div className="table-wrap">
                    <table className="product-table">
                      <thead>
                        <tr>
                          <th>PRODUCT</th>
                          <th>SKU</th>
                          <th>CATEGORY</th>
                          <th>COST PRICE</th>
                          <th>SELL PRICE</th>
                          <th>STOCK</th>
                          <th>STATUS</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>

                      <tbody>
                        {visibleProducts.map((p) => {
                          const low =
                            Number(p.quantity) <= Number(p.reorder_level)

                          return (
                            <tr key={p.id}>
                              <td>
                                <div className="product-cell">
                                  <div className="product-thumb">
                                    <Wrench size={18} />
                                  </div>

                                  <div>
                                    <strong>{p.name}</strong>
                                    <small>
                                      {p.brand || 'No brand specified'}
                                    </small>
                                  </div>
                                </div>
                              </td>

                              <td>
                                <span className="sku-text">{p.sku}</span>
                              </td>

                              <td>
                                <span className="category-chip">
                                  {p.category_name || 'Uncategorised'}
                                </span>
                              </td>

                              <td>{money(p.cost_price)}</td>

                              <td className="selling-price">
                                {money(p.selling_price)}
                              </td>

                              <td>
                                <strong>{p.quantity}</strong>
                                <small className="stock-subtext">
                                  Reorder at {p.reorder_level}
                                </small>
                              </td>

                              <td>
                                {showInactive ? (
                                  <span className="stock-status low">
                                    <span />
                                    Inactive
                                  </span>
                                ) : (
                                  <span
                                    className={`stock-status ${low ? 'low' : 'healthy'}`}
                                  >
                                    <span />
                                    {low ? 'Low stock' : 'In stock'}
                                  </span>
                                )}
                              </td>

                              <td>
                                <div className="row-actions">
                                  {showInactive ? (
                                    <button
                                      className="icon-button"
                                      title="Reactivate product"
                                      aria-label={`Reactivate ${p.name}`}
                                      onClick={() => reactivateProduct(p)}
                                    >
                                      <Check size={16} />
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        className="icon-button"
                                        title="Edit product"
                                        aria-label={`Edit ${p.name}`}
                                        onClick={() => {
                                          setEditing(p)
                                          setModal('product')
                                        }}
                                      >
                                        <Pencil size={16} />
                                      </button>

                                      <button
                                        className="icon-button danger-hover"
                                        title="Deactivate product"
                                        aria-label={`Deactivate ${p.name}`}
                                        onClick={() => deactivateProduct(p)}
                                      >
                                        <Power size={16} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <footer className="table-footer">
                  <span>
                    Showing <strong>{visibleProducts.length}</strong> of{' '}
                    <strong>
                      {showInactive
                        ? inactiveProducts.length
                        : products.length}
                    </strong>{' '}
                    {showInactive ? 'inactive products' : 'active products'}
                  </span>

                  <span className="footer-note">
                    <ShieldCheck size={14} />
                    Changes are saved to the database
                  </span>
                </footer>
              </section>

              <Restocking />

              {!showInactive && (
                <div className="page-footnote">
                  <ClipboardList size={15} />
                  Stock cost value reflects current quantity multiplied by
                  the product's current cost price. Stock movement history
                  will be added in the next milestone.
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {modal === 'product' && (
        <Modal
          title={editing ? 'Edit product' : 'Add new product'}
          onClose={() => {
            setModal(null)
            setEditing(null)
          }}
        >
          <ProductForm
            categories={categories}
            initial={editing}
            onSubmit={saveProduct}
            onCancel={() => {
              setModal(null)
              setEditing(null)
            }}
            busy={busy}
          />
        </Modal>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, note, tone }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={20} />
      </div>

      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </article>
  )
}

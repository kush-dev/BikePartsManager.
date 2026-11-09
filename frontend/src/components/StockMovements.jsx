import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDownLeft, ArrowDownRight, ArrowUpRight, Boxes, CalendarDays,
  ClipboardList, PackagePlus, RefreshCw, Search, SlidersHorizontal, TriangleAlert,
} from 'lucide-react'
import { stockMovementsApi } from '../services/api'
import './StockMovements.css'

const number = (value) => new Intl.NumberFormat('en-KE').format(Number(value) || 0)

const dateTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' })
}

const movementLabel = (type) => ({
  SALE: 'Sale',
  RECEIPT: 'Stock received',
  ADJUSTMENT: 'Manual adjustment',
}[type] || type || 'Movement')

export default function StockMovements({ products = [], onStockChanged }) {
  const [summary, setSummary] = useState(null)
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({
    product_id: '',
    movement_type: 'RECEIPT',
    quantity: '',
    direction: 'increase',
    reason: '',
    supplier_reference: '',
  })

  const filters = useMemo(() => ({
    search: search.trim(),
    movement_type: typeFilter,
    start_date: startDate,
    end_date: endDate,
    limit: 250,
  }), [search, typeFilter, startDate, endDate])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [summaryData, movementData] = await Promise.all([
        stockMovementsApi.getSummary(),
        stockMovementsApi.list(filters),
      ])
      setSummary(summaryData)
      setMovements(movementData)
    } catch (err) {
      setError(err.message || 'Could not load stock movements.')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const lowStock = useMemo(
    () => products.filter((p) => Number(p.quantity || 0) <= Number(p.reorder_level || 0))
      .sort((a, b) => (Number(a.quantity) - Number(a.reorder_level)) - (Number(b.quantity) - Number(b.reorder_level))),
    [products]
  )

  function updateForm(key, value) {
    setForm((old) => ({ ...old, [key]: value }))
  }

  async function submitMovement(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    const quantity = Number(form.quantity)
    if (!form.product_id) {
      setError('Choose a product first.')
      return
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError('Enter a whole quantity greater than zero.')
      return
    }
    if (form.reason.trim().length < 3) {
      setError('Enter a clear reason for this movement.')
      return
    }

    const signedQuantity = form.movement_type === 'ADJUSTMENT' && form.direction === 'decrease'
      ? -quantity
      : quantity

    setSaving(true)
    try {
      await stockMovementsApi.create({
        product_id: Number(form.product_id),
        movement_type: form.movement_type,
        quantity: signedQuantity,
        reason: form.reason.trim(),
        supplier_reference: form.supplier_reference.trim() || null,
      })
      setNotice(form.movement_type === 'RECEIPT' ? 'Stock receipt recorded.' : 'Stock adjustment recorded.')
      setForm({
        product_id: '',
        movement_type: 'RECEIPT',
        quantity: '',
        direction: 'increase',
        reason: '',
        supplier_reference: '',
      })
      setFormOpen(false)
      await load()
      if (onStockChanged) await onStockChanged()
    } catch (err) {
      setError(err.message || 'Could not save the stock movement.')
    } finally {
      setSaving(false)
    }
  }

  const clearFilters = () => {
    setSearch('')
    setTypeFilter('')
    setStartDate('')
    setEndDate('')
  }

  return (
    <div className="stock-movements-page">
      <section className="page-heading stock-movement-heading">
        <div>
          <div className="eyebrow">INVENTORY AUDIT TRAIL</div>
          <h1>Stock Movements</h1>
          <p>Track every stock change, from completed sales to supplier deliveries and manual adjustments.</p>
        </div>
        <button className="button primary" onClick={() => setFormOpen((open) => !open)}>
          <PackagePlus size={17} /> {formOpen ? 'Close stock entry' : 'Receive / Adjust Stock'}
        </button>
      </section>

      {error && <div className="sm-alert sm-error">{error}</div>}
      {notice && <div className="sm-alert sm-success">{notice}</div>}

      <section className="sm-summary-grid">
        <SummaryCard icon={Boxes} label="Units currently in stock" value={number(summary?.current_units)} note="Across active products" />
        <SummaryCard icon={ArrowDownRight} label="Units sold today" value={number(summary?.units_sold_today)} note="Deducted automatically at checkout" />
        <SummaryCard icon={ArrowDownLeft} label="Units received today" value={number(summary?.units_received_today)} note="Supplier receipts recorded today" />
        <SummaryCard icon={TriangleAlert} label="Products to restock" value={number(summary?.low_stock_products)} note="At or below reorder level" warning />
      </section>

      {formOpen && (
        <section className="panel sm-form-panel">
          <div className="sm-panel-title">
            <div>
              <h2>Record a stock movement</h2>
              <p>Sales are recorded automatically by the POS. Use this form for supplier receipts or stock corrections.</p>
            </div>
          </div>
          <form className="sm-entry-form" onSubmit={submitMovement}>
            <label>
              Movement type
              <select value={form.movement_type} onChange={(e) => updateForm('movement_type', e.target.value)}>
                <option value="RECEIPT">Stock received from supplier</option>
                <option value="ADJUSTMENT">Manual stock adjustment</option>
              </select>
            </label>
            <label>
              Product
              <select required value={form.product_id} onChange={(e) => updateForm('product_id', e.target.value)}>
                <option value="">Select a product</option>
                {products.filter((p) => p.is_active !== false).slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {p.sku} (stock: {p.quantity})</option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input type="number" min="1" step="1" required value={form.quantity} onChange={(e) => updateForm('quantity', e.target.value)} placeholder="e.g. 12" />
            </label>
            {form.movement_type === 'ADJUSTMENT' && (
              <label>
                Adjustment direction
                <select value={form.direction} onChange={(e) => updateForm('direction', e.target.value)}>
                  <option value="increase">Increase stock</option>
                  <option value="decrease">Decrease stock</option>
                </select>
              </label>
            )}
            {form.movement_type === 'RECEIPT' && (
              <label>
                Supplier / delivery reference <span className="sm-optional">Optional</span>
                <input value={form.supplier_reference} onChange={(e) => updateForm('supplier_reference', e.target.value)} placeholder="Supplier name or invoice number" />
              </label>
            )}
            <label className="sm-reason-field">
              Reason
              <input required minLength="3" value={form.reason} onChange={(e) => updateForm('reason', e.target.value)} placeholder={form.movement_type === 'RECEIPT' ? 'e.g. Delivery received against invoice' : 'e.g. Physical count correction or damaged item'} />
            </label>
            <div className="sm-form-actions">
              <button className="button secondary" type="button" onClick={() => setFormOpen(false)}>Cancel</button>
              <button className="button primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save movement'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel sm-ledger-panel">
        <div className="sm-panel-title">
          <div>
            <h2>Movement ledger</h2>
            <p>Each record shows the quantity change and the stock balance before and after it.</p>
          </div>
          <button className="button secondary sm-refresh" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        <div className="sm-filters">
          <div className="sm-search">
            <Search size={17} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, SKU or reason…" aria-label="Search stock movements" />
          </div>
          <select aria-label="Filter movement type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All movement types</option>
            <option value="SALE">Sales</option>
            <option value="RECEIPT">Stock received</option>
            <option value="ADJUSTMENT">Manual adjustments</option>
          </select>
          <label className="sm-date-filter"><CalendarDays size={15} /><input aria-label="Start date" type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label className="sm-date-filter"><CalendarDays size={15} /><input aria-label="End date" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} /></label>
          <button className="button secondary sm-clear" onClick={clearFilters} type="button"><SlidersHorizontal size={15} /> Clear</button>
        </div>

        {loading ? (
          <div className="sm-empty"><span className="spinner" /> Loading stock movement history…</div>
        ) : movements.length === 0 ? (
          <div className="sm-empty">
            <div className="sm-empty-icon"><ClipboardList size={24} /></div>
            <strong>No stock movements found</strong>
            <span>Completed POS sales and any stock receipts or adjustments will appear here.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="sm-table">
              <thead><tr>
                <th>DATE & TIME</th><th>PRODUCT</th><th>TYPE</th><th>CHANGE</th><th>BEFORE</th><th>AFTER</th><th>REASON / REFERENCE</th>
              </tr></thead>
              <tbody>
                {movements.map((item) => (
                  <tr key={item.id}>
                    <td className="sm-date-cell">{dateTime(item.created_at)}</td>
                    <td><div className="sm-product-name"><strong>{item.product_name}</strong><small>{item.sku}</small></div></td>
                    <td><span className={`sm-type-badge ${item.movement_type.toLowerCase()}`}>{movementLabel(item.movement_type)}</span></td>
                    <td><strong className={item.quantity_change < 0 ? 'sm-negative' : 'sm-positive'}>{item.quantity_change > 0 ? '+' : ''}{number(item.quantity_change)}</strong></td>
                    <td>{number(item.quantity_before)}</td>
                    <td><strong>{number(item.quantity_after)}</strong></td>
                    <td className="sm-reason-cell">{item.reason || (item.receipt_number ? `POS receipt ${item.receipt_number}` : '—')}{item.receipt_number && <small>Receipt: {item.receipt_number}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="sm-ledger-footer">
          <span>Showing <strong>{movements.length}</strong> movement records (maximum 250 per query)</span>
          <span><Activity size={14} /> POS sales are logged automatically</span>
        </footer>
      </section>

      <section className="panel sm-restock-panel">
        <div className="sm-panel-title">
          <div>
            <h2>Restocking priorities</h2>
            <p>Products at or below their configured reorder level.</p>
          </div>
        </div>
        {lowStock.length === 0 ? (
          <div className="sm-restock-clear">No active products currently need restocking.</div>
        ) : (
          <div className="table-wrap">
            <table className="sm-table">
              <thead><tr><th>PRODUCT</th><th>SKU</th><th>REMAINING</th><th>REORDER LEVEL</th><th>SHORTFALL</th></tr></thead>
              <tbody>{lowStock.map((p) => {
                const shortfall = Math.max(0, Number(p.reorder_level || 0) - Number(p.quantity || 0))
                return <tr key={p.id}>
                  <td><strong>{p.name}</strong></td><td>{p.sku}</td><td><strong className={Number(p.quantity) === 0 ? 'sm-negative' : ''}>{number(p.quantity)}</strong></td><td>{number(p.reorder_level)}</td><td><span className="sm-shortfall">{shortfall ? number(shortfall) : 'At threshold'}</span></td>
                </tr>
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, note, warning }) {
  return (
    <article className="sm-summary-card">
      <div className={`sm-summary-icon ${warning ? 'warning' : ''}`}><Icon size={19} /></div>
      <div className="sm-summary-label">{label}</div>
      <div className="sm-summary-value">{value ?? '—'}</div>
      <div className="sm-summary-note">{note}</div>
    </article>
  )
}

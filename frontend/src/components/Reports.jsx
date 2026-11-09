import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, Banknote, CalendarDays, ChartNoAxesCombined, CircleDollarSign,
  Download, FileSpreadsheet, Filter, Plus, ReceiptText, RefreshCw,
  TrendingDown, TrendingUp, Wallet, X, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { reportsApi } from '../services/api'
import './Reports.css'

const money = (value) => new Intl.NumberFormat('en-KE', {
  style: 'currency', currency: 'KES', maximumFractionDigits: 2,
}).format(Number(value) || 0)
const number = (value) => new Intl.NumberFormat('en-KE').format(Number(value) || 0)
const today = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}
const methodColors = ['#3977ee', '#16a477', '#f0a43a', '#8a63d2']

function Metric({ icon: Icon, label, value, note, tone, prominent = false }) {
  return (
    <article className={`report-metric ${prominent ? 'report-metric-prominent' : ''}`}>
      <div className={`report-metric-icon ${tone}`}><Icon size={19} /></div>
      <div className="report-metric-label">{label}</div>
      <div className="report-metric-value">{value}</div>
      <div className="report-metric-note">{note}</div>
    </article>
  )
}

function TrendChart({ items, yearly }) {
  const width = 760, height = 250, left = 58, right = 18, top = 18, bottom = 42
  const values = items.map((x) => Number(x.revenue) || 0)
  const max = Math.max(...values, 1)
  const plotW = width - left - right, plotH = height - top - bottom
  const points = items.map((item, i) => ({
    ...item,
    x: left + (items.length < 2 ? plotW / 2 : i * plotW / (items.length - 1)),
    y: top + plotH - ((Number(item.revenue) || 0) / max) * plotH,
  }))
  const line = points.map((p) => `${p.x},${p.y}`).join(' ')
  const area = points.length ? `${left},${top + plotH} ${line} ${left + plotW},${top + plotH}` : ''
  const labelEvery = items.length > 24 ? Math.ceil(items.length / 12) : yearly ? 1 : items.length > 14 ? 4 : items.length > 8 ? 2 : 1
  return (
    <div className="report-chart-canvas">
      {!items.length ? <div className="report-empty">No sales data for this period yet.</div> : (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sales revenue trend">
          {[0, 1, 2, 3].map((step) => {
            const y = top + plotH * step / 3
            const value = max * (1 - step / 3)
            return <g key={step}>
              <line x1={left} y1={y} x2={width - right} y2={y} className="report-grid-line" />
              <text x={left - 9} y={y + 4} textAnchor="end" className="report-axis-label">
                {value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : Math.round(value)}
              </text>
            </g>
          })}
          <polygon points={area} className="report-area-fill" />
          {points.length > 1 && <polyline points={line} className="report-line" />}
          {points.map((point, i) => <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="3.5" className="report-point">
              <title>{`${point.label}: ${money(point.revenue)}`}</title>
            </circle>
            {(i % labelEvery === 0 || i === points.length - 1) && (
              <text x={point.x} y={height - 13} textAnchor="middle" className="report-axis-label">{point.label}</text>
            )}
          </g>)}
        </svg>
      )}
    </div>
  )
}

function PaymentMix({ items }) {
  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  let cursor = 0
  const slices = items.map((item, i) => {
    const fraction = total ? Number(item.amount) / total : 0
    const start = cursor
    cursor += fraction * 100
    return { ...item, start, end: cursor, percent: fraction * 100, color: methodColors[i % methodColors.length] }
  })
  const gradient = total
    ? `conic-gradient(${slices.map((x) => `${x.color} ${x.start}% ${x.end}%`).join(', ')})`
    : 'conic-gradient(var(--report-track) 0% 100%)'
  return (
    <div className="report-payment-layout">
      <div className="report-donut" style={{ background: gradient }}>
        <div className="report-donut-hole"><strong>{money(total)}</strong><span>collected</span></div>
      </div>
      <div className="report-payment-legend">
        {slices.length ? slices.map((item) => (
          <div className="report-payment-row" key={item.method}>
            <span className="report-legend-dot" style={{ background: item.color }} />
            <span className="report-payment-method">{item.method}</span>
            <div className="report-payment-amount"><strong>{money(item.amount)}</strong><small>{item.percent.toFixed(1)}%</small></div>
          </div>
        )) : <div className="report-empty report-empty-small">No payments recorded in this period.</div>}
      </div>
    </div>
  )
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}
function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const [period, setPeriod] = useState('daily')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [appliedFilters, setAppliedFilters] = useState({ period: 'daily' })
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [entryOpen, setEntryOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [entry, setEntry] = useState({
    entry_date: today(), entry_type: 'EXPENSE', category: 'Other', amount: '', payment_method: 'Cash', description: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await reportsApi.getReport(appliedFilters)
      setReport(data)
    } catch (err) {
      setError(err.message || 'Could not load financial reports.')
    } finally {
      setLoading(false)
    }
  }, [appliedFilters])

  useEffect(() => { load() }, [load])

  const label = useMemo(() => {
    if (!report) return 'Selected period'
    return `${new Date(`${report.start_date}T12:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(`${report.end_date}T12:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }, [report])

  function selectPeriod(value) {
    setPeriod(value)
    if (value !== 'custom') setAppliedFilters({ period: value })
  }
  function applyCustom() {
    if (!startDate || !endDate) {
      setError('Select both dates for a custom report.')
      return
    }
    if (endDate < startDate) {
      setError('The end date must be on or after the start date.')
      return
    }
    setAppliedFilters({ period: 'custom', start_date: startDate, end_date: endDate })
  }

  async function saveEntry(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await reportsApi.createEntry({
        ...entry,
        amount: Number(entry.amount),
        category: entry.category.trim(),
        description: entry.description.trim(),
      })
      setEntry({ entry_date: today(), entry_type: 'EXPENSE', category: 'Other', amount: '', payment_method: 'Cash', description: '' })
      setEntryOpen(false)
      setSuccess('Financial entry saved. Your report has been updated.')
      await load()
    } catch (err) {
      setError(err.message || 'Could not save this financial entry.')
    } finally {
      setSaving(false)
    }
  }

  function exportTransactions() {
    if (!report) return
    const rows = [
      ['Receipt', 'Date/time', 'Payment method', 'Units sold', 'Revenue (KES)', 'Gross profit (KES)'],
      ...report.transactions.map((x) => [x.receipt_number, x.created_at, x.payment_method, x.units_sold, x.total_amount, x.gross_profit]),
    ]
    downloadCsv(`bikeparts-sales-${report.start_date}-to-${report.end_date}.csv`, rows)
  }
  function exportFinancialEntries() {
    if (!report) return
    const rows = [
      ['Type', 'Category', 'Amount (KES)', 'Payment method', 'Description', 'Entry date'],
      ...report.financial_entries.map((x) => [x.entry_type, x.category, x.amount, x.payment_method, x.description, x.local_date]),
    ]
    downloadCsv(`bikeparts-financial-entries-${report.start_date}-to-${report.end_date}.csv`, rows)
  }

  return (
    <div className="reports-page">
      <section className="page-heading reports-heading">
        <div>
          <div className="eyebrow">FINANCIAL PERFORMANCE</div>
          <h1>Reports</h1>
          <p>Track sales, profitability, payments and cash position for your shop.</p>
        </div>
        <div className="reports-heading-actions">
          <button className="button secondary" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="button primary" onClick={() => setEntryOpen((v) => !v)}>
            {entryOpen ? <X size={16} /> : <Plus size={16} />}
            {entryOpen ? 'Close entry' : 'Record money movement'}
          </button>
        </div>
      </section>

      {error && <div className="report-alert report-alert-error"><AlertCircle size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
      {success && <div className="report-alert report-alert-success"><CheckCircle2 size={17} /><span>{success}</span><button onClick={() => setSuccess('')} aria-label="Dismiss message"><X size={15} /></button></div>}

      {entryOpen && (
        <section className="report-panel report-entry-panel">
          <div className="report-panel-heading">
            <div><h2>Record a financial entry</h2><p>Use this for expenses, opening cash float, cash received or cash paid out.</p></div>
          </div>
          <form className="report-entry-form" onSubmit={saveEntry}>
            <label>Entry date
              <input required type="date" value={entry.entry_date} onChange={(e) => setEntry({ ...entry, entry_date: e.target.value })} />
            </label>
            <label>Entry type
              <select value={entry.entry_type} onChange={(e) => setEntry({ ...entry, entry_type: e.target.value })}>
                <option value="EXPENSE">Business expense</option>
                <option value="OPENING_FLOAT">Opening cash float</option>
                <option value="CASH_IN">Other cash received</option>
                <option value="CASH_OUT">Cash paid out (not an expense)</option>
              </select>
            </label>
            <label>Category
              <input required maxLength="80" value={entry.category} onChange={(e) => setEntry({ ...entry, category: e.target.value })} placeholder="e.g. Rent, wages, utilities" />
            </label>
            <label>Amount (KES)
              <input required type="number" min="0.01" step="0.01" value={entry.amount} onChange={(e) => setEntry({ ...entry, amount: e.target.value })} placeholder="0.00" />
            </label>
            <label>Payment method
              <select value={entry.payment_method} onChange={(e) => setEntry({ ...entry, payment_method: e.target.value })}>
                <option>Cash</option><option>M-Pesa</option><option>Card</option><option>Other</option>
              </select>
            </label>
            <label className="report-entry-description">Description / reference
              <input maxLength="1000" value={entry.description} onChange={(e) => setEntry({ ...entry, description: e.target.value })} placeholder="Optional note, supplier or receipt reference" />
            </label>
            <div className="report-entry-actions">
              <button type="button" className="button secondary" onClick={() => setEntryOpen(false)}>Cancel</button>
              <button type="submit" className="button primary" disabled={saving || !entry.amount || Number(entry.amount) <= 0}>
                <CheckCircle2 size={15} /> {saving ? 'Saving…' : 'Save entry'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="report-filter-panel">
        <div className="report-filter-title"><div className="report-filter-icon"><Filter size={17} /></div><div><strong>Reporting period</strong><span>All totals and charts update to the selected dates.</span></div></div>
        <div className="report-period-buttons" role="group" aria-label="Reporting period">
          {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly'], ['custom', 'Custom range']].map(([value, text]) => (
            <button key={value} className={`report-period-button ${period === value ? 'active' : ''}`} onClick={() => selectPeriod(value)}>{text}</button>
          ))}
        </div>
        {period === 'custom' && (
          <div className="report-custom-range">
            <label>Start date<input type="date" value={startDate} max={endDate || undefined} onChange={(e) => setStartDate(e.target.value)} /></label>
            <label>End date<input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} /></label>
            <button className="button primary" onClick={applyCustom}><CalendarDays size={15} /> Apply dates</button>
          </div>
        )}
        <div className="report-filter-footer"><span><CalendarDays size={14} /> {report ? label : 'Loading selected dates…'}</span><span className="report-timezone">Kenya time (EAT)</span></div>
      </section>

      {loading && !report ? <div className="report-loading"><span className="spinner" /> Loading financial data…</div> : report && <>
        <div className="report-section-label"><span>FINANCIAL SUMMARY</span><small>{label}</small></div>
        <section className="report-metrics-grid">
          <Metric icon={CircleDollarSign} label="Sales revenue" value={money(report.revenue)} note={`${number(report.sales_count)} completed sales`} tone="blue" />
          <Metric icon={TrendingUp} label="Gross profit" value={money(report.gross_profit)} note={`${money(report.cost_of_goods_sold)} cost of goods sold`} tone="green" />
          <Metric icon={report.net_profit >= 0 ? TrendingUp : TrendingDown} label={report.net_profit >= 0 ? 'Net profit' : 'Net loss'} value={money(report.net_profit)} note={`${money(report.expenses)} recorded business expenses`} tone={report.net_profit >= 0 ? 'green' : 'red'} prominent />
          <Metric icon={Activity} label="Units sold" value={number(report.units_sold)} note={`${number(report.sales_count)} transactions`} tone="violet" />
        </section>

        <section className="report-cash-banner">
          <div className="report-cash-icon"><Wallet size={22} /></div>
          <div className="report-cash-copy"><span>TOTAL EXPECTED AMOUNT</span><strong>{money(report.total_expected_cash ?? report.expected_cash)}</strong><small>
  Sales revenue + opening float + cash received − expenses and cash outflows
</small></div>
          <div className="report-cash-breakdown">
            <div><span>Cash sales</span><strong>{money(report.cash_sales)}</strong></div>
            <div><span>M-Pesa sales</span><strong>{money(report.mpesa_sales)}</strong></div>
            <div><span>Card sales</span><strong>{money(report.card_sales)}</strong></div>
            <div><span>Other sales</span><strong>{money(report.other_sales)}</strong></div>
            <div><span>Opening float</span><strong>{money(report.opening_float)}</strong></div>
            <div><span>Money received</span><strong>{money(report.total_money_in ?? report.cash_in)}</strong></div>
            <div><span>Expenses / money out</span><strong>− {money(report.total_money_out ?? report.cash_out)}</strong></div>
          </div>
        </section>
        <div className="report-info-note"><AlertCircle size={15} /><span>Total expected cash includes sales from every payment method (Cash, M-Pesa, Card and Other), plus the opening cash float and recorded money received, minus recorded expenses and money paid out. Use the payment mix and your M-Pesa records to reconcile the total manually. Net profit is calculated separately as gross profit minus recorded business expenses.</span></div>

        <section className="report-main-grid">
          <article className="report-panel report-trend-panel">
            <div className="report-panel-heading"><div><h2>Sales revenue trend</h2><p>Revenue by {report.trend_granularity === 'month' ? 'month' : 'day'}, including zero-sales periods.</p></div><div className="report-panel-icon"><ChartNoAxesCombined size={18} /></div></div>
            <TrendChart items={report.trend} yearly={report.trend_granularity === 'month'} />
          </article>
          <article className="report-panel report-payment-panel">
            <div className="report-panel-heading"><div><h2>Payment mix</h2><p>Share of sales by payment method.</p></div><div className="report-panel-icon"><Banknote size={18} /></div></div>
            <PaymentMix items={report.payment_mix} />
          </article>
        </section>

        <section className="report-panel report-products-panel">
          <div className="report-panel-heading"><div><h2>Best-selling products</h2><p>Ranked by units sold in the selected period.</p></div><span className="report-count-pill">{report.top_products.length} products</span></div>
          {report.top_products.length ? <div className="report-table-wrap"><table className="report-table">
            <thead><tr><th>PRODUCT</th><th>SKU</th><th>UNITS SOLD</th><th>REVENUE</th><th>GROSS PROFIT</th></tr></thead>
            <tbody>{report.top_products.map((product) => <tr key={product.product_id}>
              <td><strong>{product.name}</strong></td><td className="report-sku">{product.sku}</td><td>{number(product.units_sold)}</td><td>{money(product.revenue)}</td><td className={product.gross_profit < 0 ? 'report-negative' : 'report-positive'}>{money(product.gross_profit)}</td>
            </tr>)}</tbody>
          </table></div> : <div className="report-empty">No products sold in this reporting period.</div>}
        </section>

        <section className="report-panel report-transactions-panel">
          <div className="report-panel-heading report-table-heading"><div><h2>Sales transactions</h2><p>Receipts recorded in the selected period.</p></div><button className="button secondary" onClick={exportTransactions}><Download size={15} /> Export CSV</button></div>
          {report.transactions.length ? <div className="report-table-wrap"><table className="report-table">
            <thead><tr><th>RECEIPT</th><th>DATE / TIME</th><th>PAYMENT</th><th>UNITS</th><th>REVENUE</th><th>GROSS PROFIT</th></tr></thead>
            <tbody>{report.transactions.map((sale) => <tr key={sale.id}>
              <td><strong>{sale.receipt_number}</strong></td><td>{sale.created_at ? new Date(sale.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }) : '—'}</td><td><span className="report-method-pill">{sale.payment_method}</span></td><td>{number(sale.units_sold)}</td><td>{money(sale.total_amount)}</td><td className={sale.gross_profit < 0 ? 'report-negative' : 'report-positive'}>{money(sale.gross_profit)}</td>
            </tr>)}</tbody>
          </table></div> : <div className="report-empty">No sales recorded for this period.</div>}
          {report.transactions.length >= report.transaction_limit && <div className="report-table-footnote">Showing the latest {report.transaction_limit} sales. Narrow the date range to export a smaller complete period.</div>}
        </section>

        <section className="report-panel report-transactions-panel">
          <div className="report-panel-heading report-table-heading"><div><h2>Expenses & cash movements</h2><p>Recorded expenses, opening float and other cash movements in this period.</p></div><button className="button secondary" onClick={exportFinancialEntries}><FileSpreadsheet size={15} /> Export CSV</button></div>
          {report.financial_entries.length ? <div className="report-table-wrap"><table className="report-table">
            <thead><tr><th>TYPE</th><th>CATEGORY</th><th>DESCRIPTION</th><th>METHOD</th><th>AMOUNT</th><th>DATE</th></tr></thead>
            <tbody>{report.financial_entries.map((item) => <tr key={item.id}>
              <td><span className={`report-entry-type ${item.entry_type.toLowerCase()}`}>{item.entry_type.replaceAll('_', ' ')}</span></td><td>{item.category}</td><td>{item.description || '—'}</td><td>{item.payment_method}</td><td>{money(item.amount)}</td><td>{item.local_date ? new Date(`${item.local_date}T12:00:00`).toLocaleDateString('en-KE', { dateStyle: 'medium' }) : '—'}</td>
            </tr>)}</tbody>
          </table></div> : <div className="report-empty"><ReceiptText size={22} /><strong>No financial entries yet</strong><span>Record expenses and opening cash float to make profit and drawer figures more complete.</span><button className="button secondary" onClick={() => setEntryOpen(true)}><Plus size={14} /> Record an entry</button></div>}
        </section>
        <div className="report-footnote"><CheckCircle2 size={14} /> All reporting periods use Kenya local dates. Amounts are displayed in Kenyan shillings (KES).</div>
      </>}
    </div>
  )
}

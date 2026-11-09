
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  ChartNoAxesCombined,
  CircleDollarSign,
  Package,
  RefreshCw,
  ShoppingCart,
  TriangleAlert,
} from 'lucide-react'
import { api, salesApi } from '../services/api'
import './Dashboard.css'

const money = (value) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)

const number = (value) =>
  new Intl.NumberFormat('en-KE').format(Number(value) || 0)

function Metric({ icon: Icon, label, value, note, tone }) {
  return (
    <article className="dash-metric">
      <div className={`dash-metric-icon ${tone}`}>
        <Icon size={20} />
      </div>
      <div className="dash-metric-label">{label}</div>
      <div className="dash-metric-value">{value}</div>
      <div className="dash-metric-note">{note}</div>
    </article>
  )
}

function SalesChart({ data }) {
  const width = 640
  const height = 220
  const left = 48
  const right = 16
  const top = 16
  const bottom = 36

  const values = data.map((item) => Number(item.amount) || 0)
  const max = Math.max(...values, 1)
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom

  const points = data.map((item, index) => ({
    ...item,
    x: left + (data.length === 1
      ? plotWidth / 2
      : (index / (data.length - 1)) * plotWidth),
    y: top + plotHeight - ((Number(item.amount) || 0) / max) * plotHeight,
  }))

  const line = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = points.length
    ? `${left},${top + plotHeight} ${line} ${left + plotWidth},${top + plotHeight}`
    : ''

  return (
    <div className="dash-chart-wrap">
      {data.length === 0 ? (
        <div className="dash-empty">No sales data available.</div>
      ) : (
        <svg
          className="dash-line-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Daily sales trend"
        >
          {[0, 1, 2, 3].map((step) => {
            const y = top + (plotHeight / 3) * step
            const value = max * (1 - step / 3)

            return (
              <g key={step}>
                <line
                  x1={left}
                  y1={y}
                  x2={width - right}
                  y2={y}
                  className="dash-grid-line"
                />
                <text x={left - 8} y={y + 4} textAnchor="end" className="dash-axis-label">
                  {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value)}
                </text>
              </g>
            )
          })}

          <polygon points={area} className="dash-area-fill" />

          {points.length > 1 && (
            <polyline points={line} className="dash-line" />
          )}

          {points.map((point) => (
            <g key={point.date}>
              <circle cx={point.x} cy={point.y} r="4" className="dash-point">
                <title>{`${point.label}: ${money(point.amount)}`}</title>
              </circle>
              <text
                x={point.x}
                y={height - 12}
                textAnchor="middle"
                className="dash-axis-label"
              >
                {point.label}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}

function MovementList({ title, subtitle, items, slow = false }) {
  const max = Math.max(...items.map((item) => item.units_sold), 1)

  return (
    <section className="dash-panel">
      <div className="dash-panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="dash-empty">
          No recorded product sales in this period.
        </div>
      ) : (
        <div className="dash-movement-list">
          {items.map((item) => (
            <div className="dash-movement-item" key={item.product_id}>
              <div className="dash-movement-top">
                <div className="dash-product-name">
                  <strong>{item.name}</strong>
                  <span>{item.sku || item.category || 'Spare part'}</span>
                </div>
                <div className="dash-product-count">
                  <strong>{number(item.units_sold)}</strong>
                  <span>sold</span>
                </div>
              </div>

              <div className="dash-bar-track">
                <div
                  className={`dash-bar ${slow ? 'slow' : ''}`}
                  style={{
                    width: `${item.units_sold === 0 ? 0 : Math.max(5, (item.units_sold / max) * 100)}%`,
                  }}
                />
              </div>

              <div className="dash-movement-bottom">
                <span>Current stock: {number(item.current_stock)}</span>
                <span>
                  {item.units_sold === 0
                    ? 'No recorded sales'
                    : money(item.revenue)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Distribution({ title, subtitle, items, labelKey, valueKey }) {
  const palette = ['#3478f6', '#18a77b', '#f4a340', '#8b63d9', '#e45f70', '#23a6b8']
  const total = items.reduce(
    (sum, item) => sum + (Number(item[valueKey]) || 0),
    0
  )

  let currentAngle = 0

  const slices = items.map((item, index) => {
    const value = Number(item[valueKey]) || 0
    const fraction = total ? value / total : 0
    const start = currentAngle
    currentAngle += fraction * 360

    return {
      label: item[labelKey] || 'Other',
      value,
      percentage: fraction * 100,
      start,
      end: currentAngle,
      color: palette[index % palette.length],
    }
  })

  const gradient = total
    ? `conic-gradient(${slices.map(
        (slice) => `${slice.color} ${slice.start}deg ${slice.end}deg`
      ).join(', ')})`
    : 'conic-gradient(#e5e7eb 0deg 360deg)'

  return (
    <section className="dash-panel">
      <div className="dash-panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="dash-distribution">
        <div
          className="dash-donut"
          style={{ background: gradient }}
          role="img"
          aria-label={title}
        >
          <div className="dash-donut-hole">
            <strong>{number(total)}</strong>
            <span>{valueKey === 'amount' ? 'KES' : 'units'}</span>
          </div>
        </div>

        <div className="dash-legend">
          {slices.length === 0 ? (
            <span className="dash-muted">No data available yet.</span>
          ) : (
            slices.map((slice) => (
              <div className="dash-legend-row" key={slice.label}>
                <span
                  className="dash-legend-dot"
                  style={{ background: slice.color }}
                />
                <span className="dash-legend-label">{slice.label}</span>
                <strong>
                  {valueKey === 'amount'
                    ? money(slice.value)
                    : number(slice.value)}
                </strong>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

export default function Dashboard({ products = [], categories = [], onNavigate }) {
  const [summary, setSummary] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [days, setDays] = useState(7)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [todayData, analyticsData] = await Promise.all([
        salesApi.getTodaySummary(),
        salesApi.getAnalytics(days),
      ])

      setSummary(todayData)
      setAnalytics(analyticsData)
    } catch (err) {
      setError(err.message || 'Unable to load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const stock = useMemo(() => {
    const active = products.filter((product) => product.is_active !== false)

    return {
      count: active.length,
      units: active.reduce(
        (sum, product) => sum + Number(product.quantity || 0),
        0
      ),
      costValue: active.reduce(
        (sum, product) =>
          sum + Number(product.cost_price || 0) * Number(product.quantity || 0),
        0
      ),
      low: active.filter(
        (product) =>
          Number(product.quantity || 0) <= Number(product.reorder_level || 0)
      ),
    }
  }, [products])

  const lowStock = analytics?.low_stock || []
  const categoryData = analytics?.category_stock || []
  const paymentData = analytics?.payment_mix || []

  return (
    <div className="dashboard-page">
      <section className="page-heading dashboard-heading">
        <div>
          <div className="eyebrow">ONROUTE BIKE SPARE PARTS</div>
          <h1>Business overview</h1>
          <p>Sales performance, inventory health and restocking priorities.</p>
        </div>

        <button
          className="button secondary"
          onClick={loadDashboard}
          disabled={loading}
        >
          <RefreshCw size={15} className={loading ? 'spin' : ''} />
          Refresh
        </button>
      </section>

      {error && (
        <div className="dash-error">
          <TriangleAlert size={17} />
          <span>{error}</span>
          <button onClick={loadDashboard}>Retry</button>
        </div>
      )}

      <div className="dash-welcome">
        <div>
          <span className="dash-welcome-label">SHOP SNAPSHOT</span>
          <h2>Onroute Bike Spare Parts</h2>
          <p>Your daily operational overview at a glance.</p>
        </div>
        <div className="dash-welcome-icon">
          <ChartNoAxesCombined size={28} />
        </div>
      </div>

      <section className="dash-metrics-grid">
        <Metric
          icon={CircleDollarSign}
          label="Sales today"
          value={loading && !summary ? '—' : money(summary?.sales_amount)}
          note={`${number(summary?.sales_count)} transactions today`}
          tone="blue"
        />
        <Metric
          icon={ArrowUpRight}
          label="Gross profit today"
          value={loading && !summary ? '—' : money(summary?.gross_profit)}
          note="Sales less recorded item costs"
          tone="green"
        />
        <Metric
          icon={Boxes}
          label="Inventory cost value"
          value={money(stock.costValue)}
          note={`${number(stock.units)} units in stock`}
          tone="purple"
        />
        <Metric
          icon={TriangleAlert}
          label="Low-stock products"
          value={number(stock.low.length)}
          note="At or below reorder level"
          tone="orange"
        />
        <Metric
          icon={ShoppingCart}
          label="Items sold today"
          value={number(summary?.items_sold)}
          note="Units sold across today's sales"
          tone="teal"
        />
        <Metric
          icon={Activity}
          label="Average sale"
          value={money(summary?.average_sale)}
          note="Average transaction value today"
          tone="pink"
        />
      </section>

      <section className="dash-panel dash-sales-panel">
        <div className="dash-panel-heading dash-chart-heading">
          <div>
            <h2>Sales trend</h2>
            <p>Daily sales totals, including days with no transactions.</p>
          </div>
          <select
            className="dash-period-select"
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            aria-label="Sales trend period"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
        </div>

        {loading && !analytics ? (
          <div className="dash-empty">Loading sales trend…</div>
        ) : (
          <SalesChart data={analytics?.daily_sales || []} />
        )}
      </section>

      <div className="dash-two-column">
        <MovementList
          title="Fast-moving products"
          subtitle="Top products by units sold in the last 30 days."
          items={analytics?.fast_moving || []}
        />

        <MovementList
          title="Slow-moving products"
          subtitle="Products with the fewest recorded sales in the last 30 days."
          items={analytics?.slow_moving || []}
          slow
        />
      </div>

      <div className="dash-two-column">
        <Distribution
          title="Payment mix"
          subtitle="Sales value by payment method over the last 30 days."
          items={paymentData}
          labelKey="method"
          valueKey="amount"
        />

        <Distribution
          title="Stock by category"
          subtitle="Current inventory units grouped by category."
          items={categoryData}
          labelKey="category"
          valueKey="units"
        />
      </div>

      <section className="dash-panel">
        <div className="dash-panel-heading">
          <div>
            <h2>Restocking priorities</h2>
            <p>Products at or below their configured reorder levels.</p>
          </div>
          <button
            className="button secondary"
            onClick={() => onNavigate?.('Inventory')}
          >
            View inventory
          </button>
        </div>

        {lowStock.length === 0 ? (
          <div className="dash-empty">
            {stock.low.length === 0
              ? 'No products currently meet the low-stock rule.'
              : 'Loading restocking priorities…'}
          </div>
        ) : (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Stock</th>
                  <th>Reorder level</th>
                  <th>30-day units sold</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((item) => (
                  <tr key={item.product_id}>
                    <td>{item.name}</td>
                    <td>{item.sku || '—'}</td>
                    <td>{number(item.current_stock)}</td>
                    <td>{number(item.reorder_level)}</td>
                    <td>{number(item.units_sold)}</td>
                    <td>
                      <span className="dash-stock-badge">
                        {item.current_stock === 0 ? 'Out of stock' : 'Low stock'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="dash-footnote">
        <Package size={15} />
        <span>
          Sales use saved POS transactions. Inventory value uses current
          quantity multiplied by current cost price. Product movement is
          calculated from the last 30 days of recorded sales.
        </span>
      </div>
    </div>
  )
}

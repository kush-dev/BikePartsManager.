import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Search, ShoppingCart, Plus, Minus, Trash2, Banknote, PackageCheck,
  ReceiptText, TrendingUp, CircleDollarSign, TriangleAlert, CheckCircle2,
} from 'lucide-react'
import { salesApi } from '../services/api'

const money = (value) => new Intl.NumberFormat('en-KE', {
  style: 'currency', currency: 'KES', maximumFractionDigits: 2,
}).format(Number(value || 0))

export default function POS({ products, onSaleCompleted }) {
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [amountReceived, setAmountReceived] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [summary, setSummary] = useState({ sales_count: 0, sales_amount: 0, items_sold: 0, gross_profit: 0, average_sale: 0 })
  const [recentSales, setRecentSales] = useState([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)

  const loadSalesData = useCallback(async () => {
    setLoadingStats(true)
    try {
      const [today, recent] = await Promise.all([salesApi.getTodaySummary(), salesApi.getRecentSales(6)])
      setSummary(today)
      setRecentSales(recent)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingStats(false)
    }
  }, [])

  useEffect(() => { loadSalesData() }, [loadSalesData])

  const total = useMemo(() => cart.reduce((sum, item) => { const price = Number(item.unit_price); return sum + (Number.isFinite(price) ? price : 0) * Number(item.quantity || 0) }, 0), [cart])
  const cartUnits = useMemo(() => cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0), [cart])
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => p.is_active !== false && p.quantity > 0 && (!q || [p.name, p.sku, p.brand, p.category_name].some((v) => String(v || '').toLowerCase().includes(q))))
  }, [products, search])

  useEffect(() => {
    if (!amountTouched) setAmountReceived(total.toFixed(2))
  }, [total, amountTouched])

  function addProduct(product) {
    setError('')
    setReceipt(null)
    setCart((old) => {
      const existing = old.find((item) => item.id === product.id)
      if (existing) {
        if (existing.quantity >= product.quantity) {
          setError(`Only ${product.quantity} unit(s) of ${product.name} are in stock.`)
          return old
        }
        return old.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      }
      return [...old, { ...product, quantity: 1, unit_price: Number(product.selling_price).toFixed(2) }]
    })
  }

  function updateLine(id, changes) {
    setCart((old) => old.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  function setQuantity(id, rawValue) {
    const requested = Number(rawValue)
    const product = products.find((p) => p.id === id)
    if (!product) return
    if (rawValue === '') {
      setCart((old) => old.map((item) => item.id === id ? { ...item, quantity: '' } : item))
      return
    }
    if (!Number.isInteger(requested) || requested < 1) return
    if (requested > product.quantity) {
      setError(`Only ${product.quantity} unit(s) of ${product.name} are in stock.`)
      return
    }
    setError('')
    setCart((old) => old.map((item) => item.id === id ? { ...item, quantity: requested } : item))
  }

  function removeLine(id) { setCart((old) => old.filter((item) => item.id !== id)); setError('') }

  async function completeSale() {
    setError('')
    setReceipt(null)
    if (!cart.length) { setError('Add at least one product to the cart.'); return }
    const invalidLine = cart.find((item) => !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > Number(products.find((p) => p.id === item.id)?.quantity ?? 0) || !Number.isFinite(Number(item.unit_price)) || Number(item.unit_price) < 0)
    if (invalidLine) { setError(`Check quantity and selling price for ${invalidLine.name}.`); return }
    const received = Number(amountReceived)
    if (!Number.isFinite(received) || received < total) { setError('Amount received must be equal to or greater than the total.'); return }
    setCheckoutBusy(true)
    try {
      const result = await salesApi.checkout({
        items: cart.map((item) => ({ product_id: item.id, quantity: Number(item.quantity), unit_price: Number(item.unit_price).toFixed(2) })),
        payment_method: paymentMethod,
        amount_received: received.toFixed(2),
      })
      setReceipt(result)
      setCart([])
      setSearch('')
      setAmountReceived('0.00')
      setAmountTouched(false)
      await loadSalesData()
      await onSaleCompleted()
    } catch (err) {
      setError(err.message)
      // Refresh inventory after a failed checkout too; another sale may have changed stock.
      await onSaleCompleted()
    } finally { setCheckoutBusy(false) }
  }

  return (
    <>
      <section className="page-heading pos-heading">
        <div><div className="eyebrow">CHECKOUT & TRANSACTIONS</div><h1>Point of Sale</h1><p>Search a part, adjust the quantity and agree the final price with the customer.</p></div>
        <div className="pos-live-pill"><span /> Live inventory check</div>
      </section>

      <section className="stats-grid pos-stats-grid">
        <POSStat icon={CircleDollarSign} label="Sales today" value={loadingStats ? '…' : money(summary.sales_amount)} note="Completed transactions" tone="green" />
        <POSStat icon={PackageCheck} label="Items sold today" value={loadingStats ? '…' : Number(summary.items_sold || 0).toLocaleString()} note="Units leaving inventory" tone="blue" />
        <POSStat icon={ReceiptText} label="Transactions today" value={loadingStats ? '…' : Number(summary.sales_count || 0).toLocaleString()} note="Successful checkouts" tone="violet" />
        <POSStat icon={TrendingUp} label="Gross profit today" value={loadingStats ? '…' : money(summary.gross_profit)} note="Sales less recorded item cost" tone="orange" />
        <POSStat icon={CircleDollarSign} label="Average sale" value={loadingStats ? '…' : money(summary.average_sale)} note="Sales amount per transaction" tone="blue" />
      </section>

      {error && <div className="alert error-alert pos-error"><TriangleAlert size={18} /><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {receipt && <div className="pos-success"><CheckCircle2 size={20} /><div><strong>Sale completed — {receipt.receipt_number}</strong><span>Total {money(receipt.total_amount)} · Change due {money(receipt.change_due)}</span></div></div>}

      <div className="pos-layout">
        <section className="panel pos-products-panel">
          <div className="inventory-toolbar"><div><h2>Find a product</h2><p>Search by product name, SKU, brand or category.</p></div><span className="pos-result-count">{filteredProducts.length} available</span></div>
          <label className="search-box pos-search"><Search size={19} /><input autoComplete="off" aria-label="Search products for sale" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search or scan SKU…" /></label>
          <div className="pos-product-results">
            {filteredProducts.length === 0 ? <div className="pos-empty"><PackageCheck size={25} /><strong>No available products found</strong><span>Try another search or check inventory quantities.</span></div> : filteredProducts.map((product) => {
              const inCart = cart.find((item) => item.id === product.id)
              return <article className="pos-product-row" key={product.id}>
                <div className="pos-product-symbol"><PackageCheck size={19} /></div>
                <div className="pos-product-info"><strong>{product.name}</strong><span>{product.sku}{product.brand ? ` · ${product.brand}` : ''}</span><small>{product.category_name || 'Uncategorised'} · {product.quantity} in stock</small></div>
                <div className="pos-product-action"><strong>{money(product.selling_price)}</strong><button className="button small primary" disabled={Boolean(inCart && inCart.quantity >= product.quantity)} onClick={() => addProduct(product)}><Plus size={15} /> Add</button></div>
              </article>
            })}
          </div>
        </section>

        <section className="panel pos-cart-panel">
          <div className="pos-cart-heading"><div className="pos-cart-icon"><ShoppingCart size={20} /></div><div><h2>Current sale</h2><p>{cartUnits} item unit(s) in cart</p></div><span className="cart-count">{cart.length}</span></div>
          {cart.length === 0 ? <div className="pos-cart-empty"><ShoppingCart size={28} /><strong>Your cart is empty</strong><span>Add products from the list to begin checkout.</span></div> : <div className="pos-cart-lines">
            {cart.map((item) => <article className="pos-cart-line" key={item.id}>
              <div className="pos-cart-line-top"><div><strong>{item.name}</strong><small>{item.sku} · Stock available: {products.find((p) => p.id === item.id)?.quantity ?? item.quantity}</small></div><button className="icon-button danger-hover" onClick={() => removeLine(item.id)} aria-label={`Remove ${item.name}`} title="Remove item"><Trash2 size={16} /></button></div>
              <div className="pos-line-fields">
                <label><span>Quantity</span><div className="quantity-control"><button type="button" onClick={() => setQuantity(item.id, String(Math.max(1, Number(item.quantity || 1) - 1)))} aria-label="Decrease quantity"><Minus size={13} /></button><input aria-label={`Quantity for ${item.name}`} type="number" min="1" max={products.find((p) => p.id === item.id)?.quantity ?? item.quantity} value={item.quantity} onChange={(e) => setQuantity(item.id, e.target.value)} /><button type="button" onClick={() => setQuantity(item.id, String(Number(item.quantity || 0) + 1))} disabled={Number(item.quantity) >= Number(products.find((p) => p.id === item.id)?.quantity ?? 0)} aria-label="Increase quantity"><Plus size={13} /></button></div></label>
                <label><span>Sell price / unit (KSh)</span><input className="price-input" type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => updateLine(item.id, { unit_price: e.target.value })} /></label>
              </div>
              <div className="pos-line-bottom"><span>Inventory price: {money(item.selling_price)}</span><strong>{money(Number(item.unit_price || 0) * Number(item.quantity || 0))}</strong></div>
            </article>)}
          </div>}
          <div className="pos-checkout">
            <div className="pos-total-row"><span>Sale total</span><strong>{money(total)}</strong></div>
            <div className="pos-payment-fields"><label><span>Payment method</span><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option>Cash</option><option>M-Pesa</option><option>Card</option><option>Other</option></select></label><label><span>Amount received (KSh)</span><input type="number" min={total} step="0.01" value={amountReceived} onChange={(e) => { setAmountReceived(e.target.value); setAmountTouched(true) }} /></label></div>
            <div className="pos-change-row"><span>Change due</span><strong>{money(Math.max(0, Number(amountReceived || 0) - total))}</strong></div>
            <button className="button primary pos-sell-button" disabled={checkoutBusy || cart.length === 0 || Number(amountReceived || 0) < total} onClick={completeSale}>{checkoutBusy ? <><span className="button-spinner" /> Processing sale…</> : <><Banknote size={18} /> Sold — complete checkout</>}</button>
            <p className="pos-checkout-note">Completing a sale saves the receipt, records payment, deducts stock and logs each stock movement.</p>
          </div>
        </section>
      </div>

      <section className="panel pos-recent-panel">
        <div className="inventory-toolbar"><div><h2>Recent sales</h2><p>Latest completed transactions saved in the database.</p></div><button className="button secondary" onClick={loadSalesData} disabled={loadingStats}>Refresh</button></div>
        {recentSales.length === 0 ? <div className="pos-recent-empty">No sales recorded yet. Completed checkouts will appear here.</div> : <div className="table-wrap"><table className="product-table"><thead><tr><th>RECEIPT</th><th>TIME</th><th>ITEMS</th><th>PAYMENT</th><th>TOTAL</th></tr></thead><tbody>{recentSales.map((sale) => <tr key={sale.id}><td><span className="sku-text">{sale.receipt_number}</span></td><td>{sale.created_at ? new Date(sale.created_at).toLocaleString('en-KE') : '—'}</td><td>{sale.items.reduce((sum, item) => sum + Number(item.quantity), 0)}</td><td><span className="category-chip">{sale.payment_method}</span></td><td className="selling-price">{money(sale.total_amount)}</td></tr>)}</tbody></table></div>}
      </section>
    </>
  )
}

function POSStat({ icon: Icon, label, value, note, tone }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20} /></div><div className="stat-label">{label}</div><div className="stat-value pos-stat-value">{value}</div><div className="stat-note">{note}</div></article>
}

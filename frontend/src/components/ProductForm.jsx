import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'

const blank = {
  sku: '', name: '', brand: '', category_id: '',
  cost_price: '0.00', selling_price: '0.00',
  quantity: '0', reorder_level: '5', description: '',
}

export default function ProductForm({ categories, initial, onSubmit, onCancel, busy }) {
  const [form, setForm] = useState(blank)

  useEffect(() => {
    if (initial) {
      setForm({
        sku: initial.sku ?? '',
        name: initial.name ?? '',
        brand: initial.brand ?? '',
        category_id: initial.category_id ? String(initial.category_id) : '',
        cost_price: String(initial.cost_price ?? '0.00'),
        selling_price: String(initial.selling_price ?? '0.00'),
        quantity: String(initial.quantity ?? 0),
        reorder_level: String(initial.reorder_level ?? 5),
        description: initial.description ?? '',
      })
    } else {
      setForm(blank)
    }
  }, [initial])

  const set = (key, value) => setForm((old) => ({ ...old, [key]: value }))

  function submit(event) {
    event.preventDefault()
    onSubmit({
      sku: form.sku.trim().toUpperCase(),
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category_id: form.category_id ? Number(form.category_id) : null,
      cost_price: Number(form.cost_price),
      selling_price: Number(form.selling_price),
      quantity: Number(form.quantity),
      reorder_level: Number(form.reorder_level),
      description: form.description.trim() || null,
    })
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <div className="form-grid">
        <label>Product name *<input required maxLength="160" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Heavy-duty chain" /></label>
        <label>SKU / product code *<input required maxLength="40" value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="e.g. CHN-001" /></label>
        <label>Category<select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">Uncategorised</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Brand<input maxLength="100" value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder="Brand (optional)" /></label>
        <label>Cost price (KES) *<input type="number" required min="0" step="0.01" value={form.cost_price} onChange={(e) => set('cost_price', e.target.value)} /></label>
        <label>Selling price (KES) *<input type="number" required min="0" step="0.01" value={form.selling_price} onChange={(e) => set('selling_price', e.target.value)} /></label>
        <label>Opening stock *<input type="number" required min="0" step="1" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></label>
        <label>Low-stock alert at *<input type="number" required min="0" step="1" value={form.reorder_level} onChange={(e) => set('reorder_level', e.target.value)} /></label>
      </div>
      <label>Description<textarea rows="3" maxLength="2000" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Fitment, size, notes (optional)" /></label>
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
        <button className="button primary" type="submit" disabled={busy}><Save size={16} />{busy ? 'Saving…' : 'Save product'}</button>
      </div>
    </form>
  )
}

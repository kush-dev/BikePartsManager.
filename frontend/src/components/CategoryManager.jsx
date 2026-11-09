import { useState } from 'react'
import { Plus, Tag } from 'lucide-react'
import Modal from './Modal'

export default function CategoryManager({ categories, onCreate, busy }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  async function submit(event) {
    event.preventDefault()
    const ok = await onCreate({ name: name.trim(), description: description.trim() || null })
    if (ok) { setName(''); setDescription(''); setOpen(false) }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div><span className="eyebrow">CATALOGUE</span><h2>Categories</h2></div>
        <button className="button primary" onClick={() => setOpen(true)}><Plus size={16} /> Add category</button>
      </div>
      {categories.length === 0 ? (
        <div className="empty-state compact"><Tag size={25} /><strong>No categories yet</strong><span>Create categories to organise your spare parts.</span></div>
      ) : (
        <div className="category-list">{categories.map((category) => (
          <div className="category-item" key={category.id}>
            <span className="category-icon"><Tag size={17} /></span>
            <div><strong>{category.name}</strong><small>{category.description || 'No description'}</small></div>
            <span className="category-count">{category.product_count ?? ''}</span>
          </div>
        ))}</div>
      )}
      {open && <Modal title="Add category" onClose={() => setOpen(false)}>
        <form className="form-stack" onSubmit={submit}>
          <label>Category name *<input required maxLength="80" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chains and sprockets" /></label>
          <label>Description<input maxLength="500" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" /></label>
          <div className="form-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancel</button><button className="button primary" disabled={busy}><Plus size={16} /> Create category</button></div>
        </form>
      </Modal>}
    </section>
  )
}

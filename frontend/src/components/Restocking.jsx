import { useCallback, useEffect, useState } from 'react'
import { Download, RefreshCw, Wallet, PackagePlus } from 'lucide-react'
import { restockingApi } from '../services/api'
import './Restocking.css'

const today = () => {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const money = value =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0)

function downloadCsv(entries) {
  const rows = [
    ['Date', 'Reason', 'Description', 'Amount (KES)'],
    ...entries.map(item => [
      item.entry_date,
      item.category,
      item.description,
      item.amount,
    ]),
  ]

  const cell = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = rows.map(row => row.map(cell).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF', csv], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bikeparts-restocking-${today()}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function Restocking() {
  const [balance, setBalance] = useState(0)
  const [entries, setEntries] = useState([])
  const [entryDate, setEntryDate] = useState(today())
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('Restocking')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [balanceData, entryData] = await Promise.all([
        restockingApi.getBalance(),
        restockingApi.getEntries(),
      ])

      setBalance(Number(balanceData.available_funds) || 0)
      setEntries(entryData)
    } catch (err) {
      setError(err.message || 'Could not load restocking data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const requestedAmount = Number(amount)
  const validAmount =
    amount.trim() !== '' &&
    Number.isFinite(requestedAmount) &&
    requestedAmount > 0 &&
    requestedAmount <= balance

  async function submitWithdrawal(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }

    if (requestedAmount > balance) {
      setError(
        `Insufficient funds. Available balance: ${money(balance)}.`
      )
      return
    }

    setSaving(true)

    try {
      const result = await restockingApi.createEntry({
        entry_date: entryDate,
        entry_type: 'CASH_OUT',
        category: 'Restocking',
        amount: requestedAmount,
        payment_method: 'Cash',
        description: [
          reason.trim(),
          description.trim(),
        ].filter(Boolean).join(' — '),
      })

      setAmount('')
      setDescription('')
      setReason('Restocking')
      setEntryDate(today())
      setNotice(
        `Withdrawal recorded. Remaining funds: ${money(result.available_funds)}.`
      )

      await loadData()
    } catch (err) {
      setError(err.message || 'Could not record the withdrawal.')
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="restocking-page">
      <div className="restocking-heading">
        <div>
          <h2>Restocking &amp; Cash Outflow</h2>
          <p>
            Record money taken from available funds to purchase stock.
            Product quantities are managed separately.
          </p>
        </div>

        <button
          type="button"
          className="button secondary"
          onClick={loadData}
          disabled={loading}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="restocking-balance">
        <div className="restocking-balance-icon">
          <Wallet size={22} />
        </div>
        <div>
          <span>AVAILABLE FUNDS</span>
          <strong>{money(balance)}</strong>
          <small>Balance after recorded sales and cash movements</small>
        </div>
      </div>

      {error && <div className="restocking-message error">{error}</div>}
      {notice && <div className="restocking-message success">{notice}</div>}

      <div className="restocking-grid">
        <form className="restocking-panel" onSubmit={submitWithdrawal}>
          <h3><PackagePlus size={18} /> Record a withdrawal</h3>

          <label>
            Transaction date
            <input
              type="date"
              value={entryDate}
              max={today()}
              onChange={event => setEntryDate(event.target.value)}
              required
            />
          </label>

          <label>
            Reason
            <select
              value={reason}
              onChange={event => setReason(event.target.value)}
              required
            >
              <option value="Restocking">Restocking</option>
              <option value="Supplier payment">Supplier payment</option>
              <option value="Transport for stock">Transport for stock</option>
              <option value="Other stock purchase">Other stock purchase</option>
            </select>
          </label>

          <label>
            Amount (KES)
            <input
              type="number"
              min="0.01"
              max={balance}
              step="0.01"
              value={amount}
              onChange={event => setAmount(event.target.value)}
              placeholder="e.g. 18000"
              required
            />
          </label>

          {amount !== '' && requestedAmount > balance && (
            <p className="restocking-inline-error">
              The amount exceeds available funds by {money(requestedAmount - balance)}.
            </p>
          )}

          <label>
            Description (optional)
            <textarea
              rows={3}
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="Supplier name, items purchased, or notes"
            />
          </label>

          <div className="restocking-balance-preview">
            <span>Balance after withdrawal</span>
            <strong>
              {money(Math.max(0, balance - (requestedAmount || 0)))}
            </strong>
          </div>

          <button
            type="submit"
            className="button primary"
            disabled={saving || !validAmount || !entryDate}
          >
            {saving ? 'Recording…' : 'Record withdrawal'}
          </button>
        </form>

        <section className="restocking-panel">
          <div className="restocking-history-heading">
            <div>
              <h3>Withdrawal history</h3>
              <p>{entries.length} recorded transactions</p>
            </div>

            <button
              type="button"
              className="button secondary"
              onClick={() => downloadCsv(entries)}
              disabled={!entries.length}
            >
              <Download size={15} />
              Export CSV
            </button>
          </div>

          {loading ? (
            <p>Loading restocking records…</p>
          ) : entries.length === 0 ? (
            <p className="restocking-empty">
              No restocking withdrawals have been recorded.
            </p>
          ) : (
            <div className="restocking-table-wrap">
              <table className="restocking-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reason / description</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map(item => (
                    <tr key={item.id}>
                      <td>{item.entry_date}</td>
                      <td>
                        <strong>{item.category}</strong>
                        {item.description && <small>{item.description}</small>}
                      </td>
                      <td className="restocking-amount">
                        − {money(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  )
}
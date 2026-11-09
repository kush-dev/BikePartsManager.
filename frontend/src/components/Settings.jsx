
import { useEffect, useState } from 'react'
import {
  Store,
  SlidersHorizontal,
  Package,
  ShoppingCart,
  Palette,
  Database,
  Save,
  RotateCcw,
  Sun,
  Moon,
} from 'lucide-react'
import './Settings.css'

const STORAGE_KEY = 'bpm-app-settings'

const defaultSettings = {
  shopName: 'OnRoute Bike Spare Parts',
  phone: '',
  email: '',
  location: 'Ruiru, Kiambu',
  currency: 'KES',
  dateFormat: 'DD/MM/YYYY',
  lowStockThreshold: 5,
  defaultPaymentMethod: 'Cash',
  receiptFooter: 'Thank you for shopping with us.',
  printReceipt: true,
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved
      ? { ...defaultSettings, ...JSON.parse(saved) }
      : defaultSettings
  } catch {
    return defaultSettings
  }
}

export default function SettingsPage({ theme, onThemeChange }) {
  const [settings, setSettings] = useState(loadSettings)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (notice) {
      const timeout = window.setTimeout(() => setNotice(''), 3000)
      return () => window.clearTimeout(timeout)
    }
  }, [notice])

  function update(field, value) {
    setSettings(old => ({
      ...old,
      [field]: value,
    }))
  }

  function saveSettings(event) {
    event.preventDefault()

    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    setNotice('Settings saved successfully.')
  }

  function resetSettings() {
    if (!window.confirm('Reset all settings to their default values?')) {
      return
    }

    setSettings(defaultSettings)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSettings))
    onThemeChange('light')
    setNotice('Settings have been reset.')
  }

  return (
    <div className="settings-page">
      <section className="page-heading">
        <div>
          <div className="eyebrow">APPLICATION CONFIGURATION</div>
          <h1>Settings</h1>
          <p>Manage your shop information and application preferences.</p>
        </div>
      </section>

      {notice && (
        <div className="settings-notice">
          <Save size={16} />
          {notice}
        </div>
      )}

      <form onSubmit={saveSettings}>
        <section className="settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <Store size={19} />
            </div>
            <div>
              <h2>Shop information</h2>
              <p>Business details used to identify your shop.</p>
            </div>
          </div>

          <div className="settings-grid">
            <label>
              Shop name
              <input
                value={settings.shopName}
                onChange={e => update('shopName', e.target.value)}
                required
                maxLength={120}
              />
            </label>

            <label>
              Phone number
              <input
                type="tel"
                value={settings.phone}
                onChange={e => update('phone', e.target.value)}
                placeholder="+254 7XX XXX XXX"
              />
            </label>

            <label>
              Business email
              <input
                type="email"
                value={settings.email}
                onChange={e => update('email', e.target.value)}
                placeholder="shop@example.com"
              />
            </label>

            <label>
              Shop location
              <input
                value={settings.location}
                onChange={e => update('location', e.target.value)}
                placeholder="Ruiru, Kiambu"
              />
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <SlidersHorizontal size={19} />
            </div>
            <div>
              <h2>General preferences</h2>
              <p>Regional and application display preferences.</p>
            </div>
          </div>

          <div className="settings-grid">
            <label>
              Currency
              <select value={settings.currency} disabled>
                <option value="KES">KES — Kenyan Shilling</option>
              </select>
              <small>The application currently uses KES.</small>
            </label>

            <label>
              Date format
              <select
                value={settings.dateFormat}
                onChange={e => update('dateFormat', e.target.value)}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </label>

            <label>
              Time zone
              <input value="Africa/Nairobi" disabled />
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <Package size={19} />
            </div>
            <div>
              <h2>Inventory preferences</h2>
              <p>Default stock warning preferences for the catalogue.</p>
            </div>
          </div>

          <div className="settings-grid">
            <label>
              Default low-stock threshold
              <input
                type="number"
                min="0"
                max="100000"
                value={settings.lowStockThreshold}
                onChange={e =>
                  update('lowStockThreshold', e.target.value)
                }
                required
              />
              <small>
                Intended as the default warning level for new products.
              </small>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <ShoppingCart size={19} />
            </div>
            <div>
              <h2>POS and receipts</h2>
              <p>Configure default checkout and receipt information.</p>
            </div>
          </div>

          <div className="settings-grid">
            <label>
              Default payment method
              <select
                value={settings.defaultPaymentMethod}
                onChange={e =>
                  update('defaultPaymentMethod', e.target.value)
                }
              >
                <option value="Cash">Cash</option>
                <option value="M-Pesa">M-Pesa</option>
                <option value="Card">Card</option>
                <option value="Other">Other</option>
              </select>
            </label>

            <label className="settings-full">
              Receipt footer message
              <textarea
                rows="3"
                value={settings.receiptFooter}
                onChange={e => update('receiptFooter', e.target.value)}
                maxLength={250}
              />
            </label>

            <label className="settings-checkbox">
              <input
                type="checkbox"
                checked={settings.printReceipt}
                onChange={e => update('printReceipt', e.target.checked)}
              />
              Enable receipt printing preference
            </label>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <Palette size={19} />
            </div>
            <div>
              <h2>Appearance</h2>
              <p>Choose how BikeParts Manager looks.</p>
            </div>
          </div>

          <div className="settings-theme-options">
            <button
              type="button"
              className={`settings-theme-option ${theme === 'light' ? 'selected' : ''}`}
              onClick={() => onThemeChange('light')}
            >
              <Sun size={21} />
              <span>Light mode</span>
              <small>Bright interface</small>
            </button>

            <button
              type="button"
              className={`settings-theme-option ${theme === 'dark' ? 'selected' : ''}`}
              onClick={() => onThemeChange('dark')}
            >
              <Moon size={21} />
              <span>Dark mode</span>
              <small>Low-light interface</small>
            </button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <Database size={19} />
            </div>
            <div>
              <h2>Application information</h2>
              <p>Current application environment.</p>
            </div>
          </div>

          <div className="settings-information">
            <div>
              <span>Application</span>
              <strong>BikeParts Manager</strong>
            </div>
            <div>
              <span>Currency</span>
              <strong>KES (KSh)</strong>
            </div>
            <div>
              <span>Time zone</span>
              <strong>Africa/Nairobi</strong>
            </div>
            <div>
              <span>Settings storage</span>
              <strong>Browser local storage</strong>
            </div>
          </div>

          <p className="settings-warning">
            These preferences are stored and updated in the System.
          </p>
        </section>

        <div className="settings-actions">
          <button
            type="button"
            className="button secondary"
            onClick={resetSettings}
          >
            <RotateCcw size={16} />
            Reset defaults
          </button>

          <button type="submit" className="button primary">
            <Save size={16} />
            Save settings
          </button>
        </div>
      </form>
    </div>
  )
}

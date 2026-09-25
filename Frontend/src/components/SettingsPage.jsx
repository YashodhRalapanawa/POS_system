import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import RestoreDefaultsModal from './RestoreDefaultsModal'
import { defaultSettings } from '../data/mockSettings'
import { applyTheme, defaultThemeName, getSavedThemeName, persistTheme, themeOptions as themeSelectOptions } from '../data/themeConfig'

const currencyOptions = ['USD', 'LKR', 'EUR', 'GBP', 'AUD']
const registerOptions = ['Register #01', 'Register #02', 'Register #03', 'Register #04']
const printerOptions = ['Main Receipt Printer', 'Backup Receipt Printer', 'Kitchen Printer']
const dateFormatOptions = ['MMM DD, YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']
const timeFormatOptions = ['12-hour', '24-hour']
const languageOptions = ['English', 'Sinhala', 'Tamil']
const timezoneOptions = ['Asia/Colombo', 'UTC', 'Asia/Dubai']
const themeOptions = themeSelectOptions.map((option) => option.value)

const themePreviewPalette = {
  'Vantrix Blue': { primary: '#0037b0', surface: '#f8f9ff', text: '#0b1c30' },
  'Industrial Steel': { primary: '#5c6f83', surface: '#edf2f7', text: '#1d2935' },
  'Classic 3D POS': { primary: '#2b6bd7', surface: '#dfeaf7', text: '#10253a' },
  'Blue 3D Terminal': { primary: '#2e5ea8', surface: '#c7d8ec', text: '#10253a' },
  'Teal 3D Terminal': { primary: '#187b8a', surface: '#9cc1c9', text: '#10282e' },
  'Silver 3D POS': { primary: '#536d89', surface: '#dfe4ea', text: '#1b2430' },
}

function SettingsPage() {
  const [savedSettings, setSavedSettings] = useState(() => ({
    ...defaultSettings,
    theme: getSavedThemeName(),
  }))
  const [draftSettings, setDraftSettings] = useState(() => ({
    ...defaultSettings,
    theme: getSavedThemeName(),
  }))
  const [validationErrors, setValidationErrors] = useState({})
  const [statusMessage, setStatusMessage] = useState(null)
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false)

  useEffect(() => {
    applyTheme(draftSettings.theme)
  }, [draftSettings.theme])

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(draftSettings) !== JSON.stringify(savedSettings),
    [draftSettings, savedSettings],
  )

  const updateDraftField = (field, value) => {
    setDraftSettings((currentSettings) => ({
      ...currentSettings,
      [field]: value,
    }))

    if (field === 'theme') {
      persistTheme(value)
      setSavedSettings((currentSettings) => ({
        ...currentSettings,
        theme: value,
      }))
    }

    setValidationErrors((currentErrors) => ({
      ...currentErrors,
      [field]: undefined,
    }))

    if (statusMessage && statusMessage.type === 'error') {
      setStatusMessage(null)
    }
  }

  const validateSettings = (settings) => {
    const nextErrors = {}

    if (!settings.storeName.trim()) {
      nextErrors.storeName = 'Store Name cannot be empty.'
    }

    if (!settings.storeCode.trim()) {
      nextErrors.storeCode = 'Store Code cannot be empty.'
    }

    if (!settings.currency) {
      nextErrors.currency = 'Currency is required.'
    }

    const taxRate = Number(settings.defaultTaxRate)
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      nextErrors.defaultTaxRate = 'Tax Rate must be between 0 and 100.'
    }

    const maxDiscount = Number(settings.maximumDiscount)
    if (!Number.isFinite(maxDiscount) || maxDiscount < 0 || maxDiscount > 100) {
      nextErrors.maximumDiscount = 'Maximum Discount must be between 0 and 100.'
    }

    const nextInvoiceNumber = Number(settings.nextInvoiceNumber)
    if (!Number.isFinite(nextInvoiceNumber) || nextInvoiceNumber <= 0) {
      nextErrors.nextInvoiceNumber = 'Next Invoice Number must be a positive number.'
    }

    if (!settings.invoicePrefix.trim()) {
      nextErrors.invoicePrefix = 'Invoice Prefix is required.'
    }

    return nextErrors
  }

  const handleSaveChanges = () => {
    const nextErrors = validateSettings(draftSettings)
    if (Object.keys(nextErrors).length > 0) {
      setValidationErrors(nextErrors)
      setStatusMessage({
        type: 'error',
        text: 'Please correct the highlighted settings before saving.',
      })
      return
    }

    setSavedSettings(draftSettings)
    persistTheme(draftSettings.theme)
    setValidationErrors({})
    setStatusMessage({
      type: 'success',
      text: 'Settings saved successfully.',
    })
  }

  const handleResetChanges = () => {
    setDraftSettings(savedSettings)
    setValidationErrors({})
    setStatusMessage({
      type: 'info',
      text: 'Changes discarded.',
    })
  }

  const handleRestoreDefaults = () => {
    const restoredDefaults = { ...defaultSettings, theme: defaultThemeName }
    setSavedSettings(restoredDefaults)
    setDraftSettings(restoredDefaults)
    persistTheme(defaultThemeName)
    setValidationErrors({})
    setStatusMessage({
      type: 'success',
      text: 'Default settings restored.',
    })
    setIsRestoreModalOpen(false)
  }

  const selectedThemePreview = themePreviewPalette[draftSettings.theme] || themePreviewPalette[defaultThemeName]

  return (
    <div className="settings-page">
      <header className="products-page__header settings-page__header">
        <div>
          <span className="section-label">SYSTEM CONFIGURATION</span>
          <h2>Settings</h2>
          <p>Configure store information, POS behavior, tax settings, receipts, notifications, and system preferences.</p>
        </div>

        <div className="products-page__actions settings-page__actions">
          {hasUnsavedChanges && <span className="settings-unsaved-indicator">Unsaved changes</span>}
          <Button variant="secondary" type="button" onClick={handleResetChanges}>Reset Changes</Button>
          <Button variant="primary" type="button" onClick={handleSaveChanges}>Save Changes</Button>
        </div>
      </header>

      {statusMessage && (
        <div className={`settings-status settings-status--${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <div className="settings-grid">
        <Card title="Store Profile" subtitle="Basic information used across the POS, invoices, and receipts" className="settings-card">
          <div className="settings-field-grid">
            <label className="settings-field">
              <span>Store Name</span>
              <input value={draftSettings.storeName} onChange={(event) => updateDraftField('storeName', event.target.value)} />
              {validationErrors.storeName && <small className="field-error-inline">{validationErrors.storeName}</small>}
            </label>

            <label className="settings-field">
              <span>Store Code</span>
              <input value={draftSettings.storeCode} onChange={(event) => updateDraftField('storeCode', event.target.value)} />
              {validationErrors.storeCode && <small className="field-error-inline">{validationErrors.storeCode}</small>}
            </label>

            <label className="settings-field">
              <span>Phone</span>
              <input value={draftSettings.phone} onChange={(event) => updateDraftField('phone', event.target.value)} />
            </label>

            <label className="settings-field">
              <span>Email</span>
              <input type="email" value={draftSettings.email} onChange={(event) => updateDraftField('email', event.target.value)} />
            </label>

            <label className="settings-field settings-field--full">
              <span>Address</span>
              <input value={draftSettings.address} onChange={(event) => updateDraftField('address', event.target.value)} />
            </label>

            <label className="settings-field">
              <span>City</span>
              <input value={draftSettings.city} onChange={(event) => updateDraftField('city', event.target.value)} />
            </label>

            <label className="settings-field">
              <span>Country</span>
              <input value={draftSettings.country} onChange={(event) => updateDraftField('country', event.target.value)} />
            </label>

            <label className="settings-field">
              <span>Currency</span>
              <select value={draftSettings.currency} onChange={(event) => updateDraftField('currency', event.target.value)}>
                {currencyOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {validationErrors.currency && <small className="field-error-inline">{validationErrors.currency}</small>}
            </label>
          </div>
        </Card>

        <Card title="POS & Register" subtitle="Configure register behavior and checkout defaults" className="settings-card">
          <div className="settings-field-grid">
            <label className="settings-field">
              <span>Default Register</span>
              <select value={draftSettings.defaultRegister} onChange={(event) => updateDraftField('defaultRegister', event.target.value)}>
                {registerOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>Default Receipt Printer</span>
              <select value={draftSettings.defaultReceiptPrinter} onChange={(event) => updateDraftField('defaultReceiptPrinter', event.target.value)}>
                {printerOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="settings-toggle">
              <span>Allow Negative Stock</span>
              <input type="checkbox" checked={draftSettings.allowNegativeStock} onChange={(event) => updateDraftField('allowNegativeStock', event.target.checked)} />
            </label>

            <label className="settings-toggle">
              <span>Require Customer for Sale</span>
              <input type="checkbox" checked={draftSettings.requireCustomerForSale} onChange={(event) => updateDraftField('requireCustomerForSale', event.target.checked)} />
            </label>

            <label className="settings-toggle">
              <span>Enable Cash Drawer</span>
              <input type="checkbox" checked={draftSettings.enableCashDrawer} onChange={(event) => updateDraftField('enableCashDrawer', event.target.checked)} />
            </label>

            <label className="settings-toggle">
              <span>Auto Lock Register</span>
              <input type="checkbox" checked={draftSettings.autoLockRegister} onChange={(event) => updateDraftField('autoLockRegister', event.target.checked)} />
            </label>

            <label className="settings-field">
              <span>Auto Lock After</span>
              <select value={draftSettings.autoLockAfter} onChange={(event) => updateDraftField('autoLockAfter', Number(event.target.value))}>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </label>
          </div>
        </Card>

        <Card title="Tax & Pricing" subtitle="Configure default tax behavior and pricing preferences" className="settings-card">
          <div className="settings-field-grid">
            <label className="settings-field">
              <span>Default Tax Rate</span>
              <input type="number" min="0" max="100" value={draftSettings.defaultTaxRate} onChange={(event) => updateDraftField('defaultTaxRate', Number(event.target.value))} />
              {validationErrors.defaultTaxRate && <small className="field-error-inline">{validationErrors.defaultTaxRate}</small>}
            </label>

            <label className="settings-toggle">
              <span>Prices Include Tax</span>
              <input type="checkbox" checked={draftSettings.pricesIncludeTax} onChange={(event) => updateDraftField('pricesIncludeTax', event.target.checked)} />
            </label>

            <label className="settings-toggle">
              <span>Allow Line Discounts</span>
              <input type="checkbox" checked={draftSettings.allowLineDiscounts} onChange={(event) => updateDraftField('allowLineDiscounts', event.target.checked)} />
            </label>

            <label className="settings-field">
              <span>Maximum Discount</span>
              <input type="number" min="0" max="100" value={draftSettings.maximumDiscount} onChange={(event) => updateDraftField('maximumDiscount', Number(event.target.value))} />
              {validationErrors.maximumDiscount && <small className="field-error-inline">{validationErrors.maximumDiscount}</small>}
            </label>

            <label className="settings-field">
              <span>Require Manager Approval Above</span>
              <input type="number" min="0" max="100" value={draftSettings.requireManagerApprovalAbove} onChange={(event) => updateDraftField('requireManagerApprovalAbove', Number(event.target.value))} />
            </label>
          </div>

          <p className="settings-helper-text">These pricing and tax values are currently configured locally in the frontend for the Vantrix POS prototype.</p>
        </Card>

        <Card title="Invoice & Receipt" subtitle="Configure invoice numbering and receipt behavior" className="settings-card">
          <div className="settings-field-grid">
            <label className="settings-field">
              <span>Invoice Prefix</span>
              <input value={draftSettings.invoicePrefix} onChange={(event) => updateDraftField('invoicePrefix', event.target.value)} />
              {validationErrors.invoicePrefix && <small className="field-error-inline">{validationErrors.invoicePrefix}</small>}
            </label>

            <label className="settings-field">
              <span>Next Invoice Number</span>
              <input type="number" min="1" value={draftSettings.nextInvoiceNumber} onChange={(event) => updateDraftField('nextInvoiceNumber', Number(event.target.value))} />
              {validationErrors.nextInvoiceNumber && <small className="field-error-inline">{validationErrors.nextInvoiceNumber}</small>}
            </label>

            <label className="settings-field settings-field--full">
              <span>Receipt Footer</span>
              <input value={draftSettings.receiptFooter} onChange={(event) => updateDraftField('receiptFooter', event.target.value)} />
            </label>

            <label className="settings-toggle">
              <span>Show Store Address</span>
              <input type="checkbox" checked={draftSettings.showStoreAddress} onChange={(event) => updateDraftField('showStoreAddress', event.target.checked)} />
            </label>

            <label className="settings-toggle">
              <span>Show Cashier Name</span>
              <input type="checkbox" checked={draftSettings.showCashierName} onChange={(event) => updateDraftField('showCashierName', event.target.checked)} />
            </label>

            <label className="settings-toggle">
              <span>Show Tax Breakdown</span>
              <input type="checkbox" checked={draftSettings.showTaxBreakdown} onChange={(event) => updateDraftField('showTaxBreakdown', event.target.checked)} />
            </label>

            <label className="settings-toggle">
              <span>Auto Generate Invoice</span>
              <input type="checkbox" checked={draftSettings.autoGenerateInvoice} onChange={(event) => updateDraftField('autoGenerateInvoice', event.target.checked)} />
            </label>
          </div>
        </Card>

        <Card title="Notifications" subtitle="Choose which operational notifications are enabled" className="settings-card">
          <div className="settings-toggle-list">
            <label className="settings-toggle settings-toggle--row">
              <span>Low Stock Alerts</span>
              <input type="checkbox" checked={draftSettings.lowStockAlerts} onChange={(event) => updateDraftField('lowStockAlerts', event.target.checked)} />
            </label>

            <label className="settings-toggle settings-toggle--row">
              <span>Out of Stock Alerts</span>
              <input type="checkbox" checked={draftSettings.outOfStockAlerts} onChange={(event) => updateDraftField('outOfStockAlerts', event.target.checked)} />
            </label>

            <label className="settings-toggle settings-toggle--row">
              <span>Pending Payment Alerts</span>
              <input type="checkbox" checked={draftSettings.pendingPaymentAlerts} onChange={(event) => updateDraftField('pendingPaymentAlerts', event.target.checked)} />
            </label>

            <label className="settings-toggle settings-toggle--row">
              <span>Return Approval Alerts</span>
              <input type="checkbox" checked={draftSettings.returnApprovalAlerts} onChange={(event) => updateDraftField('returnApprovalAlerts', event.target.checked)} />
            </label>

            <label className="settings-toggle settings-toggle--row">
              <span>Daily Sales Summary</span>
              <input type="checkbox" checked={draftSettings.dailySalesSummary} onChange={(event) => updateDraftField('dailySalesSummary', event.target.checked)} />
            </label>
          </div>
        </Card>

        <Card title="System Preferences" subtitle="Store-level display and operational preferences" className="settings-card">
          <div className="settings-field-grid">
            <label className="settings-field">
              <span>Date Format</span>
              <select value={draftSettings.dateFormat} onChange={(event) => updateDraftField('dateFormat', event.target.value)}>
                {dateFormatOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>Time Format</span>
              <select value={draftSettings.timeFormat} onChange={(event) => updateDraftField('timeFormat', event.target.value)}>
                {timeFormatOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>Language</span>
              <select value={draftSettings.language} onChange={(event) => updateDraftField('language', event.target.value)}>
                {languageOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="settings-field">
              <span>Timezone</span>
              <select value={draftSettings.timezone} onChange={(event) => updateDraftField('timezone', event.target.value)}>
                {timezoneOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>

            <label className="settings-field settings-field--theme">
              <span>Theme</span>
              <div className="settings-theme-field">
                <select value={draftSettings.theme} onChange={(event) => updateDraftField('theme', event.target.value)}>
                  {themeOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <div className="settings-theme-preview" aria-label={`Theme preview for ${draftSettings.theme}`}>
                  <span className="settings-theme-preview__swatch settings-theme-preview__swatch--primary" style={{ background: selectedThemePreview.primary }} />
                  <span className="settings-theme-preview__swatch settings-theme-preview__swatch--surface" style={{ background: selectedThemePreview.surface, borderColor: selectedThemePreview.text }} />
                  <span className="settings-theme-preview__swatch settings-theme-preview__swatch--text" style={{ background: selectedThemePreview.text }} />
                </div>
              </div>
            </label>

            <label className="settings-toggle">
              <span>Compact Table Mode</span>
              <input type="checkbox" checked={draftSettings.compactTableMode} onChange={(event) => updateDraftField('compactTableMode', event.target.checked)} />
            </label>
          </div>
        </Card>
      </div>

      <div className="settings-defaults-box">
        <div>
          <strong>Restore Defaults</strong>
          <p>Restore the Settings screen to the original Vantrix POS mock configuration.</p>
        </div>
        <Button variant="secondary" type="button" onClick={() => setIsRestoreModalOpen(true)}>Restore Defaults</Button>
      </div>

      <RestoreDefaultsModal
        isOpen={isRestoreModalOpen}
        onClose={() => setIsRestoreModalOpen(false)}
        onConfirm={handleRestoreDefaults}
      />
    </div>
  )
}

export default SettingsPage

import React from 'react'
import Button from './ui/Button'

function CurrencySafeguardModal({
  isOpen,
  onClose,
  onConfirm,
  currentCurrency,
  newCurrency,
  isLoading,
}) {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="confirmation-modal currency-safeguard-modal"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: '540px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '2rem', lineHeight: 1 }}>⚠️</span>
          <div>
            <h3 style={{ margin: 0, color: 'var(--text-primary, #0f172a)' }}>
              Confirm Currency Configuration Change
            </h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)' }}>
              Important Safeguard Notice
            </span>
          </div>
        </div>

        <div
          style={{
            background: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid rgba(234, 179, 8, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1.25rem',
            color: 'var(--text-primary, #1e293b)',
            fontSize: '0.9rem',
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>
            You are changing the store currency from{' '}
            <span style={{ color: '#0284c7' }}>{currentCurrency?.currencyCode || 'USD'}</span> to{' '}
            <span style={{ color: '#16a34a' }}>
              {newCurrency?.currencyCode} ({newCurrency?.currencySymbol})
            </span>
            .
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            <li>
              <strong>No Automatic Numeric Conversion:</strong> Existing product prices will retain their numerical values. A product priced at 250 will now be labeled as {newCurrency?.currencySymbol} 250.00.
            </li>
            <li>
              <strong>Historical Order Integrity:</strong> Previously completed orders will preserve their historical currency ({currentCurrency?.currencyCode || 'USD'}) and will not be converted.
            </li>
            <li>
              <strong>Immediate POS Adoption:</strong> All active registers and cashiers will immediately display monetary values in {newCurrency?.currencyCode}.
            </li>
          </ul>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #64748b)', margin: '0 0 1.25rem 0' }}>
          Please verify that product price lists have been reviewed before confirming this store-wide currency change.
        </p>

        <div className="confirmation-modal__actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" type="button" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'I Understand, Update Currency'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default CurrencySafeguardModal

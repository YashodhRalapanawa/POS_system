import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { getCountryCurrencySettings, getAuthToken } from '../services/api'
import { resolveCurrencyForCountry, getCurrencyMetadata, formatCurrencyValue } from '../data/countryCurrencies'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'pos_country_currency_config'

const DEFAULT_CURRENCY_STATE = {
  countryCode: 'LK',
  countryName: 'Sri Lanka',
  currencyCode: 'LKR',
  currencyName: 'Sri Lankan Rupee',
  currencySymbol: 'Rs.',
  updatedAt: null,
}

const CurrencyContext = createContext({
  currencyConfig: DEFAULT_CURRENCY_STATE,
  formatCurrency: (amount, customCurrencyCode) => `$${Number(amount || 0).toFixed(2)}`,
  refreshCurrencySettings: async () => {},
  updateLocalCurrencyConfig: () => {},
  isLoading: false,
})

export function CurrencyProvider({ children }) {
  const auth = useAuth()
  const user = auth?.user

  const [currencyConfig, setCurrencyConfig] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(STORAGE_KEY)
        if (cached) {
          const parsed = JSON.parse(cached)
          if (parsed && parsed.currencyCode) {
            return parsed
          }
        }
      } catch {
        // Fallback to default
      }
    }
    return DEFAULT_CURRENCY_STATE
  })

  const [isLoading, setIsLoading] = useState(false)

  const refreshCurrencySettings = useCallback(async () => {
    const token = getAuthToken()
    if (!token) {
      return null
    }

    try {
      setIsLoading(true)
      const res = await getCountryCurrencySettings()
      if (res && res.success) {
        const data = res.data || res
        const resolved = {
          countryCode: data.countryCode || 'LK',
          countryName: data.countryName || 'Sri Lanka',
          currencyCode: data.currencyCode || 'LKR',
          currencyName: data.currencyName || 'Sri Lankan Rupee',
          currencySymbol: data.currencySymbol || 'Rs.',
          updatedAt: data.updatedAt || null,
        }
        setCurrencyConfig(resolved)
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(resolved))
        } catch {
          // ignore storage error
        }
        return resolved
      }
    } catch (err) {
      console.warn('Could not load authoritative currency settings, using cached or default values.', err)
    } finally {
      setIsLoading(false)
    }
    return null
  }, [])

  useEffect(() => {
    if (user || getAuthToken()) {
      refreshCurrencySettings()
    }
  }, [user, refreshCurrencySettings])

  const updateLocalCurrencyConfig = useCallback((newConfig) => {
    setCurrencyConfig((prev) => {
      const merged = { ...prev, ...newConfig }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      } catch {
        // ignore
      }
      return merged
    })
  }, [])

  const formatCurrency = useCallback((amount, customCurrencyCode) => {
    // If a customCurrencyCode is provided (such as an order's immutable saved currency), use that;
    // otherwise, use the store's globally configured currency code.
    const activeCurrency = customCurrencyCode || currencyConfig.currencyCode || 'LKR'
    return formatCurrencyValue(amount, activeCurrency)
  }, [currencyConfig.currencyCode])

  return (
    <CurrencyContext.Provider
      value={{
        currencyConfig,
        formatCurrency,
        refreshCurrencySettings,
        updateLocalCurrencyConfig,
        isLoading,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider')
  }
  return context
}

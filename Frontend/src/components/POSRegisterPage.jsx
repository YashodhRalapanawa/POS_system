import { useEffect, useMemo, useRef, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import { mockCustomers, mockProducts, paymentMethods, keyShortcuts, productCategories } from '../data/mockPOS'
import { getProducts, getProductByBarcode, getCustomers, createCustomer } from '../services/api'
import CustomerFormModal from './CustomerFormModal'
import { PERMISSIONS, usePermission } from '../auth/permissions'

const initialCart = [
  {
    id: 'prod-sony-wh1000',
    name: 'Sony WH-1000XM5',
    sku: 'SONY-WH-1000XM5',
    price: 349.99,
    quantity: 1,
    taxRate: 0.15,
    discount: 0,
  },
  {
    id: 'prod-thermal-paper',
    name: 'Thermal Paper Roll',
    sku: 'POS-THERMAL-01',
    price: 8.5,
    quantity: 2,
    taxRate: 0.15,
    discount: 0,
  },
]

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function POSRegisterPage() {
  const canCreateCustomer = usePermission(PERMISSIONS.CUSTOMERS_CREATE) || usePermission(PERMISSIONS.CUSTOMERS_MANAGE)

  const [products, setProducts] = useState(mockProducts)
  const [customers, setCustomers] = useState(mockCustomers)
  const [selectedCustomerId, setSelectedCustomerId] = useState(mockCustomers[0]?.id || '')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerFilterText, setCustomerFilterText] = useState('')
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const [addCustomerError, setAddCustomerError] = useState('')

  useEffect(() => {
    let isMounted = true

    // Fetch active products
    getProducts({ status: 'Active', all: true })
      .then((res) => {
        if (!isMounted) return
        if (res?.ok && res.data?.success) {
          const list = res.data.data?.products || []
          if (Array.isArray(list) && list.length > 0) {
            const activeList = list
              .filter((p) => p.status !== 'Inactive' && p.isActive !== false)
              .map((p) => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                barcode: p.barcode || '',
                price: Number(p.sellingPrice ?? 0),
                stock: p.stock ?? 0,
                taxRate: (Number(p.taxRate ?? 15)) / 100,
                category: p.category || 'General',
              }))
            if (activeList.length > 0) {
              setProducts(activeList)
            }
          }
        }
      })
      .catch(() => {})

    // Fetch active customers from Supabase GET /api/customers
    getCustomers({ status: 'Active', all: true })
      .then((res) => {
        if (!isMounted) return
        if (res?.ok) {
          const list = res.data?.data?.customers || res.data?.customers
          if (Array.isArray(list) && list.length > 0) {
            const activeCustomers = list.filter((c) => c.status !== 'Inactive' && c.isActive !== false)
            if (activeCustomers.length > 0) {
              setCustomers(activeCustomers)
              // Prioritize Walk-in Customer by default
              const walkIn = activeCustomers.find((c) => c.isWalkIn || c.code === 'CUS-001')
              if (walkIn) {
                setSelectedCustomerId(walkIn.id)
              } else {
                setSelectedCustomerId(activeCustomers[0].id)
              }
            }
          }
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [])

  const fetchActiveCustomers = async (autoSelectId = null) => {
    try {
      const res = await getCustomers({ status: 'Active', all: true })
      if (res?.ok) {
        const list = res.data?.data?.customers || res.data?.customers
        if (Array.isArray(list) && list.length > 0) {
          const activeCustomers = list.filter((c) => c.status !== 'Inactive' && c.isActive !== false)
          setCustomers(activeCustomers)
          if (autoSelectId) {
            setSelectedCustomerId(autoSelectId)
          }
          return activeCustomers
        }
      }
    } catch {}
    return []
  }

  const handleQuickCreateCustomer = async (formData) => {
    setIsCreatingCustomer(true)
    setAddCustomerError('')
    try {
      const res = await createCustomer(formData)
      if (res?.ok && res.data?.success) {
        const created = res.data.data?.customer || res.data.customer
        setShowAddCustomerModal(false)
        setShowCustomerModal(false)
        if (created?.id) {
          await fetchActiveCustomers(created.id)
        } else {
          await fetchActiveCustomers()
        }
      } else {
        const msg = res?.data?.message || res?.error || 'Failed to create customer.'
        setAddCustomerError(msg)
      }
    } catch (err) {
      setAddCustomerError(err.message || 'Error communicating with server.')
    } finally {
      setIsCreatingCustomer(false)
    }
  }

  const [cart, setCart] = useState(initialCart)
  const [discountType, setDiscountType] = useState('percent')
  const [discountValue, setDiscountValue] = useState(10)
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [cashTendered, setCashTendered] = useState('420.00')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [paymentValidationMessage, setPaymentValidationMessage] = useState('')
  const [cartValidationMessage, setCartValidationMessage] = useState('')
  const [showScanModal, setShowScanModal] = useState(false)
  const [scanQuery, setScanQuery] = useState('')
  const [scanError, setScanError] = useState('')
  const [scanNotification, setScanNotification] = useState(null)
  const scanInputRef = useRef(null)

  useEffect(() => {
    if (showScanModal) {
      setTimeout(() => {
        scanInputRef.current?.focus()
      }, 50)
    }
  }, [showScanModal])

  const visibleProducts = useMemo(() => {
    const value = search.trim().toLowerCase()

    return products.filter((product) => {
      const productCategory = String(product.category || '').toLowerCase()
      const matchesCategory = selectedCategory === 'All' || productCategory === selectedCategory.toLowerCase()
      const searchableValues = [
        product.name,
        product.sku,
        product.category,
        product.barcode,
        product.itemCode,
        product.item_code,
        product.code,
      ]
        .filter(Boolean)
        .map((entry) => String(entry).toLowerCase())

      const matchesSearch = !value || searchableValues.some((entry) => entry.includes(value))

      return matchesCategory && matchesSearch
    })
  }, [products, search, selectedCategory])

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  )

  const discountAmount = useMemo(() => {
    if (discountType === 'fixed') {
      return Math.min(Math.max(Number(discountValue || 0), 0), subtotal)
    }

    return (subtotal * Math.min(Math.max(Number(discountValue || 0), 0), 100)) / 100
  }, [discountType, discountValue, subtotal])

  const taxAmount = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const taxable = item.price * item.quantity - item.discount
        return sum + taxable * item.taxRate
      }, 0),
    [cart],
  )

  const total = subtotal - discountAmount + taxAmount
  const dueAmount = Math.max(total, 0)
  const tenderedValue = Number(cashTendered || 0)
  const customer = customers.find((entry) => entry.id === selectedCustomerId) || customers[0] || {
    id: 'walk-in',
    name: 'Walk-in Customer',
    code: 'CUS-001',
    phone: '',
    isWalkIn: true,
  }

  const filteredCustomerList = useMemo(() => {
    const q = customerFilterText.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) =>
      [c.name, c.code, c.phone, c.email].some((f) => String(f || '').toLowerCase().includes(q))
    )
  }, [customers, customerFilterText])

  const clampDiscountValue = (value, mode, currentSubtotal) => {
    const numericValue = Number(value)

    if (!Number.isFinite(numericValue)) {
      return 0
    }

    const safeValue = Math.max(numericValue, 0)

    if (mode === 'percent') {
      return Math.min(safeValue, 100)
    }

    return Math.min(safeValue, currentSubtotal)
  }

  const handleDiscountTypeChange = (nextMode) => {
    setDiscountType(nextMode)
    setDiscountValue((currentValue) => String(clampDiscountValue(currentValue, nextMode, subtotal)))
  }

  const handleDiscountInputChange = (event) => {
    const nextValue = event.target.value

    if (nextValue === '') {
      setDiscountValue('')
      return
    }

    const nextNumericValue = Number(nextValue)

    if (!Number.isFinite(nextNumericValue)) {
      setDiscountValue('0')
      return
    }

    setDiscountValue(String(clampDiscountValue(nextNumericValue, discountType, subtotal)))
  }

  useEffect(() => {
    if (!showScanModal) return

    const timer = window.setTimeout(() => {
      scanInputRef.current?.focus()
    }, 0)

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setShowScanModal(false)
        setScanError('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showScanModal])

  const addToCart = (product) => {
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.id === product.id)

      if (existingItem) {
        return currentCart.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        )
      }

      return [
        ...currentCart,
        {
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: product.price,
          quantity: 1,
          taxRate: product.taxRate,
          discount: 0,
        },
      ]
    })
  }

  const updateQuantity = (productId, step) => {
    setCart((currentCart) =>
      currentCart
        .map((item) => {
          if (item.id !== productId) return item
          return { ...item, quantity: Math.max(item.quantity + step, 1) }
        })
        .filter((item) => item.quantity > 0),
    )
  }

  const removeItem = (productId) => {
    setCart((currentCart) => currentCart.filter((item) => item.id !== productId))
  }

  const completeSale = () => {
    if (cart.length === 0) {
      setCartValidationMessage('Add at least one item before completing the sale.')
      setPaymentValidationMessage('')
      return
    }

    if (paymentMethod === 'Cash') {
      const hasValidTenderedAmount = Number.isFinite(tenderedValue) && tenderedValue >= 0

      if (!hasValidTenderedAmount) {
        setPaymentValidationMessage('Amount tendered must be a valid non-negative number.')
        setCartValidationMessage('')
        return
      }

      if (tenderedValue < dueAmount) {
        setPaymentValidationMessage(`Insufficient payment. Enter at least ${formatCurrency(dueAmount)}.`)
        setCartValidationMessage('')
        return
      }
    }

    setPaymentValidationMessage('')
    setCartValidationMessage('')
    setShowConfirmation(true)
  }

  const closeConfirmation = () => setShowConfirmation(false)

  const resetSale = () => {
    setCart([])
    setSelectedCategory('All')
    setSearch('')
    setSelectedCustomerId(mockCustomers[0].id)
    setDiscountType('percent')
    setDiscountValue('10')
    setPaymentMethod('Cash')
    setCashTendered('0.00')
    setShowConfirmation(false)
    setPaymentValidationMessage('')
    setCartValidationMessage('')
    setScanQuery('')
    setScanError('')
    setScanNotification(null)
  }

  const handleBarcodeScan = async (rawCode, isFromModal = false) => {
    const code = String(rawCode || '').trim()
    if (!code) {
      if (isFromModal) setScanError('Please enter a barcode, SKU, or item code.')
      return
    }

    try {
      if (isFromModal) setScanError('')

      // 1. Query real backend barcode lookup API: GET /api/products/barcode/[barcode]
      const res = await getProductByBarcode(code)
      if (res?.ok && res.data?.success && res.data?.data) {
        const prod = res.data.data
        if (prod.status === 'Inactive' || prod.isActive === false) {
          const inactiveMsg = `Product "${prod.name}" is inactive and cannot be selected for sales.`
          if (isFromModal) setScanError(inactiveMsg)
          else setScanNotification({ message: inactiveMsg, tone: 'danger' })
          return
        }

        const cartItem = {
          id: prod.id,
          name: prod.name,
          sku: prod.sku,
          barcode: prod.barcode,
          price: Number(prod.price ?? prod.sellingPrice ?? 0),
          quantity: 1,
          taxRate: (Number(prod.taxRate ?? 15)) / 100,
          category: prod.category || 'General',
        }

        addToCart(cartItem)

        if (isFromModal) {
          setShowScanModal(false)
          setScanQuery('')
          setScanError('')
        } else {
          setSearch('')
          setScanNotification({
            message: `Scanned & added: "${prod.name}" (${prod.barcode || prod.sku})`,
            tone: 'success',
          })
          setTimeout(() => setScanNotification(null), 3000)
        }
        return
      }

      // Check if backend returned inactive product rejection (400)
      if (res?.data?.message?.includes('inactive')) {
        const inactiveMsg = res.data.message
        if (isFromModal) setScanError(inactiveMsg)
        else setScanNotification({ message: inactiveMsg, tone: 'danger' })
        return
      }

      // 2. Fallback to loaded products catalogue (matching barcode or SKU)
      const normalizedLookup = code.toLowerCase()
      const fallbackMatch = products.find((product) => {
        const values = [
          product.barcode,
          product.sku,
          product.itemCode,
          product.item_code,
          product.code,
        ]
          .filter(Boolean)
          .map((entry) => String(entry).toLowerCase())

        return values.includes(normalizedLookup)
      })

      if (fallbackMatch) {
        if (fallbackMatch.status === 'Inactive' || fallbackMatch.isActive === false) {
          const inactiveMsg = `Product "${fallbackMatch.name}" is inactive and cannot be selected for sales.`
          if (isFromModal) setScanError(inactiveMsg)
          else setScanNotification({ message: inactiveMsg, tone: 'danger' })
          return
        }

        addToCart(fallbackMatch)
        if (isFromModal) {
          setShowScanModal(false)
          setScanQuery('')
          setScanError('')
        } else {
          setSearch('')
          setScanNotification({
            message: `Scanned & added: "${fallbackMatch.name}"`,
            tone: 'success',
          })
          setTimeout(() => setScanNotification(null), 3000)
        }
        return
      }

      const notFoundMsg = res?.data?.message || `No active product found for barcode "${code}".`
      if (isFromModal) {
        setScanError(notFoundMsg)
      } else {
        setScanNotification({ message: notFoundMsg, tone: 'danger' })
        setTimeout(() => setScanNotification(null), 4000)
      }
    } catch {
      const errMsg = `Failed to lookup barcode "${code}". Please try again.`
      if (isFromModal) setScanError(errMsg)
      else setScanNotification({ message: errMsg, tone: 'danger' })
    }
  }

  const handlePaymentMethodChange = (method) => {
    setPaymentMethod(method)

    if (method !== 'Cash') {
      setPaymentValidationMessage('')
    }
  }

  const handleNumericKeypad = (key) => {
    if (paymentMethod !== 'Cash') return

    if (key === 'CLR') {
      setCashTendered('0.00')
      return
    }

    if (key === 'BS') {
      setCashTendered((current) => {
        const nextValue = current.replace(/\D*$/, '')
        return nextValue.length > 0 ? nextValue : '0.00'
      })
      return
    }

    const current = String(cashTendered || '0')
    if (key === '.') {
      if (current.includes('.')) return
      setCashTendered(current === '0' ? '0.' : `${current}.`)
      return
    }

    const nextValue = current === '0' ? key : `${current}${key}`
    setCashTendered(nextValue)
  }

  return (
    <div className="pos-page">
      <header className="pos-page__topbar">
        <div className="pos-brand">
          <span className="pos-brand__label">VANTRIX POS</span>
          <div className="pos-brand__stack">
            <strong>Register #03</strong>
            <span>Store Open • Session Active</span>
          </div>
        </div>

        <div className="pos-page__status">New Sale</div>

        <div className="pos-page__user">
          <div className="pos-page__user-avatar">SJ</div>
          <div className="pos-page__user-meta">
            <span>Sarah Jenkins</span>
            <small>Cashier • 09:42 AM</small>
          </div>
        </div>
      </header>

      <div className="pos-terminal">
        <aside className="pos-terminal__sale">
          <div className="pos-panel-header">
            <div>
              <span className="section-label">Current Sale</span>
              <h3>Transaction</h3>
            </div>
            <Badge tone="success">Open</Badge>
          </div>

          <div className="pos-cart-table-wrap">
            {cart.length === 0 ? (
              <div className="empty-cart">No items in cart</div>
            ) : (
              <table className="pos-cart-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Tax</th>
                    <th>Total</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="pos-cart-product">
                          <strong>{item.name}</strong>
                          <small>{item.sku}</small>
                        </div>
                      </td>
                      <td>
                        <div className="quantity-stepper">
                          <button type="button" onClick={() => updateQuantity(item.id, -1)}>-</button>
                          <span>{item.quantity}</span>
                          <button type="button" onClick={() => updateQuantity(item.id, 1)}>+</button>
                        </div>
                      </td>
                      <td>{formatCurrency(item.price)}</td>
                      <td>{formatCurrency(item.price * item.quantity * item.taxRate)}</td>
                      <td>{formatCurrency(item.price * item.quantity)}</td>
                      <td>
                        <button type="button" className="cart-item__remove" onClick={() => removeItem(item.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="pos-cart-summary">
            <div className="pos-cart-summary__row">
              <span>Items</span>
              <strong>{cart.reduce((count, item) => count + item.quantity, 0)}</strong>
            </div>
            <div className="pos-cart-summary__row">
              <span>Subtotal</span>
              <strong>{formatCurrency(subtotal)}</strong>
            </div>
          </div>
        </aside>

        <main className="pos-terminal__main">
          <section className="pos-panel">
            <div className="pos-panel-header">
              <div>
                <span className="section-label">Product Search</span>
                <h3>Search Product</h3>
              </div>
              <Badge tone="info">F4 Search</Badge>
            </div>

            <div className="product-search">
              <div className="product-search__field">
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      if (search.trim()) {
                        handleBarcodeScan(search.trim(), false)
                      }
                    }
                  }}
                  placeholder="Search product / SKU / scan barcode (Press Enter to scan)"
                />
              </div>
              <Button variant="primary" type="button" onClick={() => setShowScanModal(true)}>Scan</Button>
            </div>

            {scanNotification && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  backgroundColor: scanNotification.tone === 'danger' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                  color: scanNotification.tone === 'danger' ? '#ef4444' : '#16a34a',
                }}
              >
                {scanNotification.message}
              </div>
            )}

            <div className="pos-categories" aria-label="Product categories">
              {productCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  className={`pos-category ${selectedCategory === category ? 'pos-category--active' : ''}`}
                  onClick={() => setSelectedCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </section>

          <section className="pos-product-grid" aria-label="Products">
            {visibleProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className="pos-product-item"
                onClick={() => addToCart(product)}
              >
                <span className="pos-product-item__name">{product.name}</span>
                <span className="pos-product-item__sku">{product.sku}</span>
                <span className="pos-product-item__meta">
                  <strong>{formatCurrency(product.price)}</strong>
                  <small>{product.stock} in stock</small>
                </span>
              </button>
            ))}
          </section>
        </main>

        <aside className="pos-terminal__tools">
          <div className="pos-panel-header">
            <div>
              <span className="section-label">Quick Actions</span>
              <h3>Cashier Tools</h3>
            </div>
          </div>

          <div className="pos-quick-actions">
            <button type="button" className="pos-quick-action">Return</button>
            <button type="button" className="pos-quick-action">Exchange</button>
            <button type="button" className="pos-quick-action">Void</button>
            <button type="button" className="pos-quick-action">Discount</button>
            <button type="button" className="pos-quick-action">Hold Sale</button>
            <button type="button" className="pos-quick-action">Recall</button>
            <button type="button" className="pos-quick-action" onClick={() => setShowCustomerModal(true)}>Customer</button>
            <button type="button" className="pos-quick-action">Receipt</button>
          </div>

          <div className="pos-shortcuts">
            {keyShortcuts.map((shortcut) => (
              <span key={shortcut}>{shortcut}</span>
            ))}
          </div>
        </aside>
      </div>

      <div className="pos-terminal__bottom">
        <section className="pos-keypad-panel">
          <div className="pos-panel-header">
            <div>
              <span className="section-label">Numeric Input</span>
              <h3>Keypad</h3>
            </div>
          </div>

          <div className="pos-keypad">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', 'CLR', '0', '.'].map((key) => (
              <button
                key={key}
                type="button"
                className="pos-keypad__button"
                onClick={() => handleNumericKeypad(key)}
              >
                {key}
              </button>
            ))}
          </div>
        </section>

        <section className="pos-checkout-panel">
          <div className="pos-panel-header">
            <div>
              <span className="section-label">Checkout</span>
              <h3>Payment</h3>
            </div>
          </div>

          <div className="checkout-section">
            <div className="form-row compact-row">
              <label>Customer</label>
              <div style={{ display: 'flex', gap: '6px', width: '100%', alignItems: 'center' }}>
                <select
                  value={selectedCustomerId}
                  onChange={(event) => setSelectedCustomerId(event.target.value)}
                  style={{ flex: 1 }}
                >
                  {customers.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} ({entry.code}){entry.isWalkIn ? ' [Walk-in]' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button button--secondary"
                  style={{ padding: '0.45rem 0.65rem', fontSize: '12px', whiteSpace: 'nowrap' }}
                  onClick={() => setShowCustomerModal(true)}
                  title="Search and select customer"
                >
                  Search
                </button>
              </div>
            </div>

            <div
              className="customer-box compact-box"
              style={{ cursor: 'pointer' }}
              onClick={() => setShowCustomerModal(true)}
              title="Click to search or change customer"
            >
              <div className="customer-box__name">
                {customer.name}
                {customer.isWalkIn && (
                  <span style={{ fontSize: '11px', color: 'var(--color-primary, #3182ce)', marginLeft: '6px' }}>
                    • Walk-in
                  </span>
                )}
              </div>
              <div className="customer-box__meta">
                {customer.phone || customer.email || (customer.isWalkIn ? 'Default Walk-in Counter Account' : customer.code)}
              </div>
            </div>

            <div className="discount-row compact-row">
              <label>Discount</label>
              <div className="discount-toggle">
                <button
                  type="button"
                  className={discountType === 'percent' ? 'active' : ''}
                  onClick={() => handleDiscountTypeChange('percent')}
                >
                  %
                </button>
                <button
                  type="button"
                  className={discountType === 'fixed' ? 'active' : ''}
                  onClick={() => handleDiscountTypeChange('fixed')}
                >
                  $
                </button>
              </div>
              <input
                type="number"
                value={discountValue}
                onChange={handleDiscountInputChange}
                min="0"
                max={discountType === 'percent' ? 100 : subtotal}
                step="0.01"
                placeholder={discountType === 'percent' ? '0–100%' : `0–${formatCurrency(subtotal)}`}
              />
            </div>

            <div className="summary-table summary-table--compact">
              <div>
                <span>Subtotal</span>
                <strong>{formatCurrency(subtotal)}</strong>
              </div>
              <div>
                <span>Discount</span>
                <strong>-{formatCurrency(discountAmount)}</strong>
              </div>
              <div>
                <span>Tax</span>
                <strong>{formatCurrency(taxAmount)}</strong>
              </div>
              <div>
                <span>Items</span>
                <strong>{cart.reduce((count, item) => count + item.quantity, 0)}</strong>
              </div>
              <div className="summary-table__total">
                <span>Total</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
            </div>

            <div className="payment-methods compact-row">
              <label>Payment</label>
              <div className="payment-methods__buttons">
                {paymentMethods.map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={paymentMethod === method ? 'active' : ''}
                    onClick={() => handlePaymentMethodChange(method)}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === 'Cash' && (
              <div className="payment-amount compact-row">
                <label>Amount Tendered</label>
                <input
                  type="number"
                  value={cashTendered}
                  onChange={(event) => {
                    setCashTendered(event.target.value)
                    setPaymentValidationMessage('')
                  }}
                  min="0"
                  step="0.01"
                />
              </div>
            )}

            <div className="payment-summary">
              <span>Amount Due</span>
              <strong>{formatCurrency(dueAmount)}</strong>
            </div>

            {paymentMethod === 'Cash' && (
              <div className="payment-summary payment-summary--muted">
                <span>Change</span>
                <strong>{formatCurrency(changeDue)}</strong>
              </div>
            )}

            {paymentValidationMessage && <div className="payment-inline-error">{paymentValidationMessage}</div>}
            {cartValidationMessage && <div className="payment-inline-error">{cartValidationMessage}</div>}

            <Button variant="primary" type="button" className="complete-sale-btn" onClick={completeSale}>
              Complete Sale
            </Button>
          </div>
        </section>
      </div>

      {showConfirmation && (
        <div className="modal-backdrop" onClick={closeConfirmation}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <div>
                <span className="section-label">Sale Completed</span>
                <h3>Order #VX-9825</h3>
              </div>
              <button type="button" className="modal__close" onClick={closeConfirmation}>
                ×
              </button>
            </div>

            <div className="modal__body">
              <div className="modal__row">
                <span>Customer</span>
                <strong>{customer.name}</strong>
              </div>
              <div className="modal__row">
                <span>Items</span>
                <strong>{cart.reduce((count, item) => count + item.quantity, 0)}</strong>
              </div>
              <div className="modal__row">
                <span>Subtotal</span>
                <strong>{formatCurrency(subtotal)}</strong>
              </div>
              <div className="modal__row">
                <span>Discount</span>
                <strong>-{formatCurrency(discountAmount)}</strong>
              </div>
              <div className="modal__row">
                <span>Tax</span>
                <strong>{formatCurrency(taxAmount)}</strong>
              </div>
              <div className="modal__row modal__row--total">
                <span>Total</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
              <div className="modal__row">
                <span>Payment</span>
                <strong>{paymentMethod}</strong>
              </div>
            </div>

            <div className="modal__actions">
              <Button variant="secondary" type="button" onClick={closeConfirmation}>Print Receipt</Button>
              <Button variant="primary" type="button" onClick={resetSale}>New Sale</Button>
            </div>
          </div>
        </div>
      )}

      {showScanModal && (
        <div className="modal-backdrop" onClick={() => { setShowScanModal(false); setScanError('') }}>
          <div className="modal scan-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <div>
                <span className="section-label">Scan Item</span>
                <h3>Scan Product</h3>
              </div>
              <button type="button" className="modal__close" onClick={() => { setShowScanModal(false); setScanError('') }}>
                ×
              </button>
            </div>

            <div className="scan-modal__body">
              <p>Enter or paste a product barcode, SKU, or item code.</p>
              <input
                ref={scanInputRef}
                type="text"
                value={scanQuery}
                onChange={(event) => {
                  setScanQuery(event.target.value)
                  if (scanError) setScanError('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleBarcodeScan(scanQuery.trim(), true)
                  }
                }}
                placeholder="Scan or type barcode / SKU"
              />
              {scanError && <div className="payment-inline-error">{scanError}</div>}
            </div>

            <div className="modal__actions scan-modal__actions">
              <Button variant="secondary" type="button" onClick={() => { setShowScanModal(false); setScanError('') }}>Cancel</Button>
              <Button variant="primary" type="button" onClick={() => handleBarcodeScan(scanQuery.trim(), true)}>Find Product</Button>
            </div>
          </div>
        </div>
      )}

      {/* POS Customer Search & Selection Modal */}
      {showCustomerModal && (
        <div className="modal-backdrop" onClick={() => { setShowCustomerModal(false); setCustomerFilterText('') }}>
          <div className="modal pos-customer-modal" style={{ maxWidth: '600px' }} onClick={(event) => event.stopPropagation()}>
            <div className="modal__header">
              <div>
                <span className="section-label">POS Customer Selection</span>
                <h3>Select Customer for Sale</h3>
              </div>
              <button type="button" className="modal__close" onClick={() => { setShowCustomerModal(false); setCustomerFilterText('') }}>
                ×
              </button>
            </div>

            <div className="modal__body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={customerFilterText}
                  onChange={(e) => setCustomerFilterText(e.target.value)}
                  placeholder="Search customer by name, code, phone, or email..."
                  style={{
                    flex: 1,
                    padding: '0.65rem 0.85rem',
                    border: '1px solid var(--border-color, #e2e8f0)',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                  autoFocus
                />
                {canCreateCustomer && (
                  <Button
                    variant="primary"
                    type="button"
                    onClick={() => {
                      setShowAddCustomerModal(true)
                      setAddCustomerError('')
                    }}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    + New Customer
                  </Button>
                )}
              </div>

              {/* Quick Walk-in Selection */}
              {(() => {
                const walkInCust = customers.find((c) => c.isWalkIn || c.code === 'CUS-001')
                if (!walkInCust) return null
                const isSelected = selectedCustomerId === walkInCust.id
                return (
                  <div
                    style={{
                      padding: '0.75rem',
                      marginBottom: '1rem',
                      borderRadius: '6px',
                      background: isSelected ? 'rgba(49, 130, 206, 0.12)' : 'var(--bg-subtle, #f7fafc)',
                      border: isSelected ? '1px solid #3182ce' : '1px dashed var(--border-color, #cbd5e0)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setSelectedCustomerId(walkInCust.id)
                      setShowCustomerModal(false)
                      setCustomerFilterText('')
                    }}
                  >
                    <div>
                      <strong>Walk-in Customer</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted, #718096)' }}>
                        Default customer account for anonymous retail transactions
                      </div>
                    </div>
                    <Badge tone={isSelected ? 'success' : 'neutral'}>
                      {isSelected ? 'Currently Selected' : 'Select Walk-in'}
                    </Badge>
                  </div>
                )
              })()}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted, #718096)', textTransform: 'uppercase' }}>
                  Registered Customers ({filteredCustomerList.filter((c) => !c.isWalkIn).length})
                </span>

                {filteredCustomerList.filter((c) => !c.isWalkIn).length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted, #718096)' }}>
                    No registered customers match your search.
                  </div>
                ) : (
                  filteredCustomerList
                    .filter((c) => !c.isWalkIn)
                    .map((c) => {
                      const isSelected = selectedCustomerId === c.id
                      return (
                        <div
                          key={c.id}
                          style={{
                            padding: '0.75rem',
                            borderRadius: '6px',
                            border: isSelected ? '1px solid #3182ce' : '1px solid var(--border-color, #e2e8f0)',
                            background: isSelected ? 'rgba(49, 130, 206, 0.08)' : 'transparent',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease',
                          }}
                          onClick={() => {
                            setSelectedCustomerId(c.id)
                            setShowCustomerModal(false)
                            setCustomerFilterText('')
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted, #718096)' }}>
                              Code: {c.code} {c.phone ? `• Phone: ${c.phone}` : ''} {c.email ? `• ${c.email}` : ''}
                            </div>
                          </div>
                          <Badge tone={isSelected ? 'success' : 'neutral'}>
                            {isSelected ? 'Selected' : 'Select'}
                          </Badge>
                        </div>
                      )
                    })
                )}
              </div>
            </div>

            <div className="modal__actions">
              <Button variant="secondary" type="button" onClick={() => { setShowCustomerModal(false); setCustomerFilterText('') }}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Customer Creation Modal */}
      {showAddCustomerModal && (
        <CustomerFormModal
          isOpen={showAddCustomerModal}
          onClose={() => {
            setShowAddCustomerModal(false)
            setAddCustomerError('')
          }}
          onSubmit={handleQuickCreateCustomer}
          mode="add"
          isSubmitting={isCreatingCustomer}
          serverError={addCustomerError}
        />
      )}
    </div>
  )
}

export default POSRegisterPage

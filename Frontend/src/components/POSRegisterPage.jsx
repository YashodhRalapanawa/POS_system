import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import { mockCustomers, mockProducts, paymentMethods, keyShortcuts, productCategories } from '../data/mockPOS'
import { getProducts, getProductByBarcode, getCustomers, createCustomer, createPosOrder, updatePosOrder, getPosOrderById, getStockAvailability, validatePosOrderStock, completePosOrder } from '../services/api'
import CustomerFormModal from './CustomerFormModal'
import { PERMISSIONS, usePermission } from '../auth/permissions'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { paths } from '../paths'

const initialCart = []

function POSRegisterPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const orderIdParam = searchParams.get('orderId')
  const { user } = useAuth()
  const { formatCurrency } = useCurrency()

  const canCreateCustomer = usePermission(PERMISSIONS.CUSTOMERS_CREATE) || usePermission(PERMISSIONS.CUSTOMERS_MANAGE)
  const canCreateDraft = usePermission(PERMISSIONS.POS_ORDERS_CREATE) || usePermission(PERMISSIONS.POS_USE)
  const canUpdateDraft = usePermission(PERMISSIONS.POS_ORDERS_UPDATE)
  const canCompleteOrder = usePermission(PERMISSIONS.POS_ORDERS_COMPLETE) || usePermission(PERMISSIONS.POS_USE) || usePermission(PERMISSIONS.ORDERS_VIEW)

  const [products, setProducts] = useState(mockProducts)
  const [customers, setCustomers] = useState(mockCustomers)
  const [selectedCustomerId, setSelectedCustomerId] = useState(mockCustomers[0]?.id || '')
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [cart, setCart] = useState(initialCart)

  const [showCustomerModal, setShowCustomerModal] = useState(false)
  const [customerFilterText, setCustomerFilterText] = useState('')
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const [addCustomerError, setAddCustomerError] = useState('')

  const [editingOrderId, setEditingOrderId] = useState(null)
  const [editingOrderNumber, setEditingOrderNumber] = useState(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [posNotification, setPosNotification] = useState(null)
  const [stockAvailability, setStockAvailability] = useState({})
  const [itemValidationErrors, setItemValidationErrors] = useState({})
  const [stockWarningBanner, setStockWarningBanner] = useState(null)
  const [showCompleteConfirmModal, setShowCompleteConfirmModal] = useState(false)
  const [isCompletingOrder, setIsCompletingOrder] = useState(false)
  const [completionError, setCompletionError] = useState(null)

  const showPosNotification = (message, tone = 'success') => {
    setPosNotification({ message, tone })
    setTimeout(() => {
      setPosNotification((curr) => (curr?.message === message ? null : curr))
    }, 4500)
  }

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

  const fetchStockAvailability = async (productIds) => {
    if (!productIds || productIds.length === 0) return
    try {
      const res = await getStockAvailability({
        storeId: user?.storeId,
        productIds,
      })
      if (res?.ok && res.data?.success) {
        const list = res.data.data?.availability || res.data.availability || []
        setStockAvailability((prev) => {
          const updated = { ...prev }
          list.forEach((item) => {
            updated[item.productId] = item
          })
          return updated
        })
      }
    } catch {}
  }

  const cartProductIdsKey = useMemo(() => cart.map((i) => i.id).sort().join(','), [cart])

  useEffect(() => {
    if (cart.length > 0) {
      const ids = cart.map((i) => i.id)
      fetchStockAvailability(ids)
    }
  }, [cartProductIdsKey, user?.storeId])

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
  const searchInputRef = useRef(null)
  const scannerBufferRef = useRef('')
  const lastKeyTimeRef = useRef(0)

  const playScanBeep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      const audioCtx = new AudioCtx()
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1760, audioCtx.currentTime)
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1)
      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()
      osc.stop(audioCtx.currentTime + 0.1)
    } catch {}
  }

  // Autofocus product search on mount so handheld scanners work immediately
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus()
    }, 150)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (showScanModal) {
      setTimeout(() => {
        scanInputRef.current?.focus()
      }, 50)
    }
  }, [showScanModal])

  // Global hardware barcode scanner (HID wedge) & F4 shortcut listener
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'F4') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        return
      }

      const activeTag = document.activeElement?.tagName
      const isInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA'
      const isSearchInput = document.activeElement === searchInputRef.current

      const now = Date.now()
      const timeDiff = now - lastKeyTimeRef.current
      lastKeyTimeRef.current = now

      // Hardware scanners typically stream characters < 60ms apart
      if (timeDiff > 75 && scannerBufferRef.current.length > 0) {
        scannerBufferRef.current = ''
      }

      if (e.key === 'Enter') {
        const buffered = scannerBufferRef.current.trim()
        if (buffered.length >= 3) {
          e.preventDefault()
          scannerBufferRef.current = ''
          handleBarcodeScan(buffered, false)
          return
        }
        scannerBufferRef.current = ''
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!isInput || isSearchInput) {
          scannerBufferRef.current += e.key
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [products])

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
  const changeDue = Math.max(tenderedValue - dueAmount, 0)
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
    setItemValidationErrors((prev) => {
      if (!prev[product.id]) return prev
      const copy = { ...prev }
      delete copy[product.id]
      return copy
    })

    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.id === product.id)
      const currentQty = existingItem ? existingItem.quantity : 0
      const nextQty = currentQty + 1
      const availInfo = stockAvailability[product.id]
      const availableStock = availInfo ? availInfo.availableQuantity : (product.stock ?? Infinity)

      if (availableStock !== Infinity && nextQty > availableStock) {
        showPosNotification(
          `Notice: Requested quantity (${nextQty}) exceeds available stock (${availableStock}) for "${product.name}".`,
          'warning'
        )
      }

      if (existingItem) {
        return currentCart.map((item) =>
          item.id === product.id ? { ...item, quantity: nextQty } : item,
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
          stock: product.stock,
          taxRate: product.taxRate,
          discount: 0,
        },
      ]
    })
  }

  const updateQuantity = (productId, step) => {
    setItemValidationErrors((prev) => {
      if (!prev[productId]) return prev
      const copy = { ...prev }
      delete copy[productId]
      return copy
    })

    setCart((currentCart) =>
      currentCart
        .map((item) => {
          if (item.id !== productId) return item
          const nextQty = Math.max(item.quantity + step, 1)
          const availInfo = stockAvailability[item.id]
          const availableStock = availInfo ? availInfo.availableQuantity : (item.stock ?? Infinity)

          if (step > 0 && availableStock !== Infinity && nextQty > availableStock) {
            showPosNotification(
              `Insufficient stock warning: "${item.name}" has ${availableStock} available, but ${nextQty} requested.`,
              'warning'
            )
          }

          return { ...item, quantity: nextQty }
        })
        .filter((item) => item.quantity > 0),
    )
  }

  const removeItem = (productId) => {
    setItemValidationErrors((prev) => {
      if (!prev[productId]) return prev
      const copy = { ...prev }
      delete copy[productId]
      return copy
    })
    setCart((currentCart) => currentCart.filter((item) => item.id !== productId))
  }

  const completeSale = async () => {
    if (cart.length === 0) {
      setCartValidationMessage('Add at least one item before completing the sale.')
      setPaymentValidationMessage('')
      return
    }

    if (editingOrderId) {
      setShowCompleteConfirmModal(true)
      return
    }

    // If new cart, save as draft first then open completion confirmation modal
    setIsSavingDraft(true)
    const payload = {
      customerId: selectedCustomerId || null,
      storeId: user?.storeId || null,
      items: cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
    }

    try {
      const valRes = await validatePosOrderStock({ storeId: user?.storeId || null, items: payload.items })
      const valData = valRes?.data?.data || valRes?.data || {}
      if (valRes?.ok && valData?.valid === false) {
        const errorMap = {}
        ;(valData.items || []).filter((it) => !it.valid).forEach((it) => {
          errorMap[it.productId] = it.message || 'Insufficient stock'
        })
        setItemValidationErrors(errorMap)
        showPosNotification('Cannot complete order: Insufficient stock for one or more items.', 'danger')
        setIsSavingDraft(false)
        return
      }

      const idempotencyKey = `pos-draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const res = await createPosOrder(payload, idempotencyKey)
      if (res?.ok && res.data?.success) {
        const created = res.data.data?.order || res.data.data
        setEditingOrderId(created.id)
        setEditingOrderNumber(created.orderNumber)
        setShowCompleteConfirmModal(true)
      } else {
        showPosNotification(res?.data?.message || 'Failed to save draft order for completion.', 'danger')
      }
    } catch (err) {
      showPosNotification(err.message || 'Error communicating with server.', 'danger')
    } finally {
      setIsSavingDraft(false)
    }
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

  useEffect(() => {
    if (!orderIdParam) return
    let isMounted = true

    getPosOrderById(orderIdParam)
      .then((res) => {
        if (!isMounted) return
        if (res?.ok && res.data?.success) {
          const ord = res.data.data?.order || res.data.data
          if (String(ord.status).toLowerCase() !== 'draft') {
            showPosNotification(`Order ${ord.orderNumber || orderIdParam} is in "${ord.status}" status and cannot be edited.`, 'danger')
            return
          }

          setEditingOrderId(ord.id)
          setEditingOrderNumber(ord.orderNumber)
          if (ord.customerId) {
            setSelectedCustomerId(ord.customerId)
          }

          const loadedCart = (ord.items || []).map((it) => ({
            id: it.productId,
            name: it.productName || it.name,
            sku: it.sku || '',
            price: Number(it.unitPrice || 0),
            quantity: Number(it.quantity || 1),
            taxRate: 0,
            discount: 0,
          }))

          setCart(loadedCart)
          showPosNotification(`Loaded draft order #${ord.orderNumber} for editing.`, 'info')
        } else {
          showPosNotification(res?.data?.message || res?.error || 'Failed to load draft order.', 'danger')
        }
      })
      .catch((err) => {
        if (isMounted) {
          showPosNotification(err.message || 'Error communicating with server.', 'danger')
        }
      })

    return () => {
      isMounted = false
    }
  }, [orderIdParam])

  const handleSaveDraftOrder = async () => {
    if (cart.length === 0) {
      setCartValidationMessage('Add at least one item before saving a draft order.')
      return
    }

    setCartValidationMessage('')
    setStockWarningBanner(null)
    setIsSavingDraft(true)

    const payload = {
      customerId: selectedCustomerId || null,
      storeId: user?.storeId || null,
      items: cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
    }

    try {
      // Step 12: Validate Before Saving via POST /api/pos/orders/validate-stock
      const validationRes = await validatePosOrderStock({
        storeId: user?.storeId || null,
        items: payload.items,
      })

      const valData = validationRes?.data?.data || validationRes?.data || {}

      if (validationRes?.ok && valData?.valid === false) {
        const errorMap = {}
        const failedItems = (valData.items || []).filter((it) => !it.valid)
        failedItems.forEach((it) => {
          errorMap[it.productId] = it.message || `Insufficient stock (${it.availableQuantity ?? 0} available)`
        })
        setItemValidationErrors(errorMap)

        if (Array.isArray(valData.items)) {
          setStockAvailability((prev) => {
            const copy = { ...prev }
            valData.items.forEach((it) => {
              copy[it.productId] = {
                availableQuantity: it.availableQuantity,
                currentStock: it.currentStock,
                reservedStock: it.reservedStock,
              }
            })
            return copy
          })
        }

        const firstMsg = failedItems[0]?.message || 'Insufficient stock for one or more items.'
        setStockWarningBanner(`Cannot save draft order: ${firstMsg}`)
        showPosNotification(`Cannot save draft: ${firstMsg}`, 'danger')
        setIsSavingDraft(false)
        return
      }

      // Clear any prior validation errors if validation passed
      setItemValidationErrors({})
      setStockWarningBanner(null)

      if (editingOrderId) {
        const res = await updatePosOrder(editingOrderId, payload)
        if (res?.ok && res.data?.success) {
          const updated = res.data.data?.order || res.data.data
          showPosNotification(`Draft order #${updated?.orderNumber || editingOrderNumber} updated successfully! (Total: ${formatCurrency(updated?.totalAmount ?? updated?.subtotal)})`, 'success')
          setEditingOrderId(null)
          setEditingOrderNumber(null)
          setSearchParams({})
          setCart([])
        } else {
          const msg = res?.data?.message || res?.error || 'Failed to update draft order.'
          showPosNotification(msg, 'danger')
          if (res?.data?.items) {
            const errMap = {}
            res.data.items.filter((it) => !it.valid).forEach((it) => {
              errMap[it.productId] = it.message
            })
            setItemValidationErrors(errMap)
          }
        }
      } else {
        const idempotencyKey = `pos-draft-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const res = await createPosOrder(payload, idempotencyKey)
        if (res?.ok && res.data?.success) {
          const created = res.data.data?.order || res.data.data
          showPosNotification(`Draft order #${created?.orderNumber} saved successfully! (Total: ${formatCurrency(created?.totalAmount ?? created?.subtotal)})`, 'success')
          setCart([])
        } else {
          const msg = res?.data?.message || res?.error || 'Failed to save draft order.'
          showPosNotification(msg, 'danger')
          if (res?.data?.items) {
            const errMap = {}
            res.data.items.filter((it) => !it.valid).forEach((it) => {
              errMap[it.productId] = it.message
            })
            setItemValidationErrors(errMap)
          }
        }
      }
    } catch (err) {
      showPosNotification(err.message || 'Error communicating with server.', 'danger')
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handleCancelEditingDraft = () => {
    setEditingOrderId(null)
    setEditingOrderNumber(null)
    setSearchParams({})
    setCart([])
    showPosNotification('Exited draft order editing.', 'info')
  }

  const handleVoidSale = () => {
    if (cart.length === 0) {
      navigate(paths.orders)
      return
    }
    if (window.confirm('Void current sale and clear cart?')) {
      setCart([])
      setEditingOrderId(null)
      setEditingOrderNumber(null)
      setItemValidationErrors({})
      setStockWarningBanner(null)
      setSearchParams({})
      showPosNotification('Current sale voided and cart cleared.', 'info')
    }
  }

  const handleDiscountFocus = () => {
    const discountEl = document.querySelector('.discount-toggle') || document.querySelector('.checkout-section')
    if (discountEl) {
      discountEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    showPosNotification('Select discount (% or $) and enter value in the checkout panel below.', 'info')
  }

  const handleHoldSaleClick = async () => {
    if (cart.length === 0) {
      navigate(paths.orders)
      return
    }
    await handleSaveDraftOrder()
  }

  const handleConfirmCompleteOrder = async () => {
    if (!editingOrderId) return
    setIsCompletingOrder(true)
    setCompletionError(null)

    try {
      const res = await completePosOrder(editingOrderId)
      if (res?.ok && res.data?.success) {
        const completed = res.data.data?.order || res.data.data
        const completedNum = completed?.orderNumber || editingOrderNumber
        showPosNotification(`Order #${completedNum} completed successfully! Stock deducted.`, 'success')
        setShowCompleteConfirmModal(false)
        setEditingOrderId(null)
        setEditingOrderNumber(null)
        setSearchParams({})
        setCart([])

        // Refresh product stock in catalog
        getProducts({ status: 'Active', all: true }).then((pRes) => {
          if (pRes?.ok && pRes.data?.success) {
            const list = pRes.data.data?.products || []
            if (Array.isArray(list) && list.length > 0) {
              setProducts(list.map((p) => ({
                id: p.id,
                name: p.name,
                sku: p.sku,
                barcode: p.barcode || '',
                price: Number(p.sellingPrice ?? 0),
                stock: p.stock ?? 0,
                taxRate: (Number(p.taxRate ?? 15)) / 100,
                category: p.category || 'General',
              })))
            }
          }
        }).catch(() => {})
      } else {
        const msg = res?.data?.message || res?.error || 'Failed to complete order.'
        setCompletionError(msg)
        showPosNotification(`Order completion failed: ${msg}`, 'danger')
      }
    } catch (err) {
      setCompletionError(err.message || 'Error communicating with server.')
      showPosNotification(err.message || 'Error communicating with server.', 'danger')
    } finally {
      setIsCompletingOrder(false)
    }
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
          stock: prod.stock ?? 0,
          taxRate: (Number(prod.taxRate ?? 15)) / 100,
          category: prod.category || 'General',
        }

        playScanBeep()
        addToCart(cartItem)
        setStockAvailability((prev) => ({
          ...prev,
          [prod.id]: {
            availableQuantity: prod.stock ?? 0,
            currentStock: prod.stock ?? 0,
          },
        }))

        if (isFromModal) {
          setShowScanModal(false)
          setScanQuery('')
          setScanError('')
        } else {
          setSearch('')
          if (searchInputRef.current) searchInputRef.current.value = ''
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

        playScanBeep()
        addToCart(fallbackMatch)
        if (isFromModal) {
          setShowScanModal(false)
          setScanQuery('')
          setScanError('')
        } else {
          setSearch('')
          if (searchInputRef.current) searchInputRef.current.value = ''
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
      {/* Toast Notification */}
      {posNotification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            backgroundColor: posNotification.tone === 'danger'
              ? 'rgba(239, 68, 68, 0.95)'
              : posNotification.tone === 'info'
                ? 'rgba(49, 130, 206, 0.95)'
                : 'rgba(34, 197, 94, 0.95)',
            color: '#fff',
            fontWeight: 500,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease-in-out',
          }}
        >
          <span>{posNotification.tone === 'danger' ? '⚠️' : posNotification.tone === 'info' ? 'ℹ️' : '✓'}</span>
          <span>{posNotification.message}</span>
        </div>
      )}

      {/* Editing Draft Order Banner */}
      {editingOrderId && (
        <div style={{
          backgroundColor: '#ebf8ff',
          borderBottom: '2px solid #3182ce',
          padding: '10px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#2b6cb0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>📝</span>
            <div>
              <strong>Editing Draft Order: #{editingOrderNumber}</strong>
              <span style={{ display: 'block', fontSize: '12px', color: '#4a5568' }}>
                You are currently updating an existing draft order. Changes will update this order without creating a duplicate.
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              variant="secondary"
              type="button"
              onClick={handleCancelEditingDraft}
              style={{ fontSize: '13px', padding: '6px 14px' }}
            >
              Exit Draft
            </Button>
          </div>
        </div>
      )}

      <header className="pos-page__topbar">
        <div className="pos-brand">
          <span className="pos-brand__label">VANTRIX POS</span>
          <div className="pos-brand__stack">
            <strong>Register #03</strong>
            <span>Store Open • Session Active</span>
          </div>
        </div>

        <div className="pos-page__status">
          {editingOrderId ? `Editing Draft #${editingOrderNumber}` : 'New Sale'}
        </div>

        <div className="pos-page__user">
          <div className="pos-page__user-avatar">
            {user?.fullName?.slice(0, 2).toUpperCase() || 'SJ'}
          </div>
          <div className="pos-page__user-meta">
            <span>{user?.fullName || 'Sarah Jenkins'}</span>
            <small>{user?.roleName || 'Cashier'} • {user?.storeName || 'Store'}</small>
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

          {stockWarningBanner && (
            <div style={{
              margin: '0.5rem 1rem 0',
              padding: '0.6rem 0.8rem',
              borderRadius: '6px',
              fontSize: '12px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#dc2626',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <span>⚠️</span>
              <span>{stockWarningBanner}</span>
            </div>
          )}

          {cartValidationMessage && (
            <div style={{
              margin: '0.5rem 1rem 0',
              padding: '0.6rem 0.8rem',
              borderRadius: '6px',
              fontSize: '12px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#dc2626',
              fontWeight: 500,
            }}>
              {cartValidationMessage}
            </div>
          )}

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
                  {cart.map((item) => {
                    const availInfo = stockAvailability[item.id]
                    const availableQty = availInfo ? availInfo.availableQuantity : (typeof item.stock === 'number' ? item.stock : null)
                    const hasError = Boolean(itemValidationErrors[item.id])
                    const isExceedingStock = typeof availableQty === 'number' && item.quantity > availableQty

                    return (
                      <tr
                        key={item.id}
                        style={{
                          backgroundColor: hasError ? 'rgba(239, 68, 68, 0.08)' : (isExceedingStock ? 'rgba(245, 158, 11, 0.08)' : undefined),
                        }}
                      >
                        <td>
                          <div className="pos-cart-product">
                            <strong>{item.name}</strong>
                            <small>{item.sku}</small>
                            <div style={{ marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: availableQty !== null && availableQty <= 0
                                    ? '#ef4444'
                                    : isExceedingStock
                                    ? '#d97706'
                                    : '#64748b',
                                  fontWeight: isExceedingStock || (availableQty !== null && availableQty <= 0) ? 600 : 400,
                                }}
                              >
                                {availableQty !== null ? `Stock: ${availableQty} avail` : 'Stock: checking...'}
                              </span>
                              {isExceedingStock && (
                                <span
                                  style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                    color: '#ef4444',
                                  }}
                                >
                                  Low Stock
                                </span>
                              )}
                            </div>
                            {itemValidationErrors[item.id] && (
                              <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                                ⚠️ {itemValidationErrors[item.id]}
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="quantity-stepper">
                            <button type="button" onClick={() => updateQuantity(item.id, -1)}>-</button>
                            <span style={{ color: isExceedingStock ? '#ef4444' : 'inherit', fontWeight: isExceedingStock ? 700 : 'inherit' }}>
                              {item.quantity}
                            </span>
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
                    )
                  })}
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

          <div className="pos-cart-actions" style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <Button
              variant="primary"
              type="button"
              onClick={handleSaveDraftOrder}
              disabled={isSavingDraft || cart.length === 0 || (!editingOrderId && !canCreateDraft) || (editingOrderId && !canUpdateDraft)}
              style={{ width: '100%', padding: '0.7rem', fontWeight: 600, fontSize: '14px' }}
            >
              {isSavingDraft
                ? (editingOrderId ? 'Updating Draft...' : 'Saving Draft...')
                : (editingOrderId ? `Update Draft #${editingOrderNumber}` : 'Save Draft Order')}
            </Button>

            {editingOrderId && (
              <>
                <Button
                  variant="success"
                  type="button"
                  onClick={() => setShowCompleteConfirmModal(true)}
                  disabled={isSavingDraft || isCompletingOrder || cart.length === 0 || !canCompleteOrder}
                  style={{
                    width: '100%',
                    padding: '0.7rem',
                    fontWeight: 700,
                    fontSize: '14px',
                    backgroundColor: '#10b981',
                    borderColor: '#10b981',
                    color: '#fff',
                  }}
                >
                  {isCompletingOrder ? 'Completing...' : `Complete Order #${editingOrderNumber}`}
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={handleCancelEditingDraft}
                  disabled={isSavingDraft || isCompletingOrder}
                  style={{ width: '100%', fontSize: '13px' }}
                >
                  Cancel Draft Editing
                </Button>
              </>
            )}
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
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      const code = (event.target.value || search).trim()
                      if (code) {
                        handleBarcodeScan(code, false)
                      }
                    }
                  }}
                  placeholder="Search product / SKU / scan barcode (Press Enter or scan)"
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
            {visibleProducts.map((product) => {
              const avail = stockAvailability[product.id]?.availableQuantity !== undefined
                ? stockAvailability[product.id].availableQuantity
                : product.stock
              const isLow = typeof avail === 'number' && avail > 0 && avail < 5
              const isOut = typeof avail === 'number' && avail <= 0

              return (
                <button
                  key={product.id}
                  type="button"
                  className="pos-product-item"
                  onClick={() => addToCart(product)}
                >
                  <span className="pos-product-item__name">{product.name}</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', margin: '2px 0 4px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: '#f1f5f9',
                      color: '#475569',
                    }}>
                      {product.category || 'General'}
                    </span>
                    <span className="pos-product-item__sku">{product.sku}</span>
                  </div>
                  <span className="pos-product-item__meta">
                    <strong>{formatCurrency(product.price)}</strong>
                    <small style={{
                      background: isOut ? '#fef2f2' : isLow ? '#fffbeb' : '#ecfdf5',
                      color: isOut ? '#b91c1c' : isLow ? '#b45309' : '#047857',
                      border: `1px solid ${isOut ? '#fecaca' : isLow ? '#fde68a' : '#a7f3d0'}`,
                      borderRadius: '6px',
                      padding: '2px 7px',
                      fontWeight: 700,
                    }}>
                      {avail !== undefined && avail !== Infinity ? `${avail} in stock` : `${product.stock} in stock`}
                    </small>
                  </span>
                </button>
              )
            })}
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
            <button
              type="button"
              className="pos-quick-action"
              onClick={() => navigate(paths.returns)}
              title="Navigate to Returns Management"
            >
              ↩️ Return
            </button>
            <button
              type="button"
              className="pos-quick-action"
              onClick={() => navigate(paths.returns)}
              title="Navigate to Returns & Exchanges"
            >
              🔄 Exchange
            </button>
            <button
              type="button"
              className="pos-quick-action"
              onClick={handleVoidSale}
              title="Void current sale and clear cart"
            >
              🚫 Void
            </button>
            <button
              type="button"
              className="pos-quick-action"
              onClick={handleDiscountFocus}
              title="Apply discount in checkout"
            >
              🏷️ Discount
            </button>
            <button
              type="button"
              className="pos-quick-action"
              onClick={handleHoldSaleClick}
              disabled={isSavingDraft || (!editingOrderId && !canCreateDraft && cart.length > 0) || (editingOrderId && !canUpdateDraft)}
              title={cart.length > 0 ? "Save cart as draft order" : "Navigate to saved orders"}
            >
              {isSavingDraft ? '⏳ Saving...' : (editingOrderId ? '💾 Update Draft' : (cart.length > 0 ? '⏸️ Hold Sale' : '⏸️ Held Orders'))}
            </button>
            <button
              type="button"
              className="pos-quick-action"
              onClick={() => navigate(paths.orders)}
              title="Navigate to Saved Draft Orders"
            >
              📋 Recall
            </button>
            <button
              type="button"
              className="pos-quick-action"
              onClick={() => navigate(paths.customers)}
              title="Navigate to Customer Management"
            >
              👤 Customer
            </button>
            <button
              type="button"
              className="pos-quick-action"
              onClick={() => navigate(paths.invoices)}
              title="Navigate to Invoices & Receipts"
            >
              🧾 Receipt
            </button>
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

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <Button
                variant="secondary"
                type="button"
                onClick={handleSaveDraftOrder}
                disabled={isSavingDraft || cart.length === 0 || (!editingOrderId && !canCreateDraft) || (editingOrderId && !canUpdateDraft)}
                style={{ flex: 1, padding: '0.75rem', fontWeight: 600 }}
              >
                {isSavingDraft ? 'Saving...' : (editingOrderId ? 'Update Draft' : 'Save Draft')}
              </Button>
              {editingOrderId ? (
                <Button
                  variant="success"
                  type="button"
                  style={{ flex: 1, backgroundColor: '#10b981', borderColor: '#10b981', color: '#fff', fontWeight: 700 }}
                  onClick={() => setShowCompleteConfirmModal(true)}
                  disabled={isSavingDraft || isCompletingOrder || cart.length === 0 || !canCompleteOrder}
                >
                  {isCompletingOrder ? 'Completing...' : 'Complete Order'}
                </Button>
              ) : (
                <Button variant="primary" type="button" className="complete-sale-btn" style={{ flex: 1 }} onClick={completeSale}>
                  Complete Sale
                </Button>
              )}
            </div>
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
      {/* Complete Order Confirmation Modal (Step 13) */}
      {showCompleteConfirmModal && (
        <div className="modal-backdrop" onClick={() => !isCompletingOrder && setShowCompleteConfirmModal(false)}>
          <div className="modal" style={{ maxWidth: '480px', width: '92%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div>
                <span className="section-label">Order Completion</span>
                <h3>Confirm POS Order Completion</h3>
              </div>
              <button
                type="button"
                className="modal__close"
                onClick={() => !isCompletingOrder && setShowCompleteConfirmModal(false)}
                disabled={isCompletingOrder}
              >
                ×
              </button>
            </div>

            <div className="modal__body" style={{ padding: '1.25rem 1.5rem' }}>
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#065f46',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>📦</span>
                <span>Complete this POS order? Stock quantities will be deducted from the selected store.</span>
              </div>

              <div className="modal__row">
                <span>Order Number</span>
                <strong>#{editingOrderNumber}</strong>
              </div>

              <div className="modal__row">
                <span>Store</span>
                <strong>{user?.storeName || 'Main Store'}</strong>
              </div>

              <div className="modal__row">
                <span>Customer</span>
                <strong>
                  {customer.name}
                  {customer.isWalkIn ? ' [Walk-in]' : ''}
                </strong>
              </div>

              <div className="modal__row">
                <span>Total Items</span>
                <strong>{cart.length} item line{cart.length === 1 ? '' : 's'}</strong>
              </div>

              <div className="modal__row">
                <span>Total Quantity</span>
                <strong>{cart.reduce((sum, item) => sum + item.quantity, 0)} units</strong>
              </div>

              <div className="modal__row modal__row--total" style={{ marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: '2px solid var(--color-border, #e2e8f0)' }}>
                <span>Order Total</span>
                <strong style={{ fontSize: '1.25rem', color: 'var(--color-primary, #3182ce)' }}>
                  {formatCurrency(total)}
                </strong>
              </div>

              {completionError && (
                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#dc2626',
                    fontSize: '0.85rem',
                    fontWeight: 500,
                  }}
                >
                  ⚠️ {completionError}
                </div>
              )}
            </div>

            <div className="modal__actions" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  setShowCompleteConfirmModal(false)
                  setCompletionError(null)
                }}
                disabled={isCompletingOrder}
              >
                Back
              </Button>
              <Button
                variant="success"
                type="button"
                onClick={handleConfirmCompleteOrder}
                disabled={isCompletingOrder}
                style={{
                  backgroundColor: '#10b981',
                  borderColor: '#10b981',
                  color: '#fff',
                  fontWeight: 600,
                  padding: '0.6rem 1.2rem',
                }}
              >
                {isCompletingOrder ? 'Completing Order...' : 'Confirm & Complete Order'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default POSRegisterPage

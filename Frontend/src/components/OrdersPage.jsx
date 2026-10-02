import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import OrderDetailsModal from './OrderDetailsModal'
import InvoicePreviewModal from './InvoicePreviewModal'
import { initialOrders, orderStatusOptions, paymentMethodOptions, dateFilterOptions } from '../data/mockOrders'
import { paths } from '../routes'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value)
}

function formatDate(value) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function OrdersPage() {
  const navigate = useNavigate()
  const [orders] = useState(initialOrders)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All Status')
  const [paymentFilter, setPaymentFilter] = useState('All Payment Methods')
  const [dateFilter, setDateFilter] = useState('All Dates')
  const [selectedOrderId, setSelectedOrderId] = useState(null)
  const [invoiceOrderId, setInvoiceOrderId] = useState(null)
  const [moreOrderId, setMoreOrderId] = useState(null)

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const searchText = search.trim().toLowerCase()
      const matchesSearch =
        searchText.length === 0 ||
        [order.id, order.customerName, order.cashier, order.invoiceNumber]
          .join(' ')
          .toLowerCase()
          .includes(searchText)

      const matchesStatus = statusFilter === 'All Status' || order.status === statusFilter
      const matchesPayment = paymentFilter === 'All Payment Methods' || order.paymentMethod === paymentFilter

      const orderDate = new Date(order.createdAt)
      const today = new Date()
      const nowStamp = today.getTime()
      const orderStamp = orderDate.getTime()
      const diffDays = (nowStamp - orderStamp) / (1000 * 60 * 60 * 24)

      let matchesDate = true

      if (dateFilter === 'Today') {
        matchesDate = orderDate.toDateString() === today.toDateString()
      } else if (dateFilter === 'Last 7 Days') {
        matchesDate = diffDays <= 7 && diffDays >= 0
      } else if (dateFilter === 'Last 30 Days') {
        matchesDate = diffDays <= 30 && diffDays >= 0
      }

      return matchesSearch && matchesStatus && matchesPayment && matchesDate
    })
  }, [orders, search, statusFilter, paymentFilter, dateFilter])

  const totalOrders = orders.length
  const completedOrders = orders.filter((order) => order.status === 'Completed').length
  const pendingOrders = orders.filter((order) => order.status === 'Pending').length
  const todaysSales = orders
    .filter((order) => new Date(order.createdAt).toDateString() === new Date().toDateString())
    .reduce((total, order) => total + order.total, 0)

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null
  const invoiceOrder = orders.find((order) => order.id === invoiceOrderId) ?? null
  const moreOrder = orders.find((order) => order.id === moreOrderId) ?? null

  return (
    <div className="products-page orders-page">
      <header className="products-page__header orders-page__header">
        <div>
          <h2>Orders</h2>
          <p>Review sales transactions, payment status, and customer order history.</p>
        </div>

        <div className="products-page__actions">
          <Button variant="secondary" type="button">Export</Button>
          <Button variant="primary" type="button" onClick={() => navigate(paths.pos)}>+ New Sale</Button>
        </div>
      </header>

      <section className="products-kpis orders-kpis">
        <Card className="products-kpis__card">
          <span className="kpi-card__label">Total Orders</span>
          <strong className="kpi-card__value small">{totalOrders}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Completed Orders</span>
          <strong className="kpi-card__value small">{completedOrders}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Pending Orders</span>
          <strong className="kpi-card__value small">{pendingOrders}</strong>
        </Card>

        <Card className="products-kpis__card">
          <span className="kpi-card__label">Today's Sales</span>
          <strong className="kpi-card__value small">{formatCurrency(todaysSales)}</strong>
        </Card>
      </section>

      <Card className="products-toolbar-card orders-toolbar-card">
        <div className="products-toolbar orders-toolbar">
          <div className="products-toolbar__search">
            <input
              type="text"
              placeholder="Search order ID, customer or cashier..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {orderStatusOptions.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
            {paymentMethodOptions.map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>

          <select value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>
            {dateFilterOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="products-table-card orders-table-card">
        <div className="products-table-wrap">
          <table className="products-table orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Cashier</th>
                <th>Items</th>
                <th>Payment</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <div className="inventory-empty-state">
                      <strong>No orders found</strong>
                      <span>Try adjusting your search or filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="order-id-cell">{order.id}</td>
                    <td className="customer-name-cell">{order.customerName}</td>
                    <td>{order.cashier}</td>
                    <td className="order-items-cell">{order.itemCount}</td>
                    <td className="order-payment-cell">{order.paymentMethod}</td>
                    <td className="order-amount-cell">{formatCurrency(order.total)}</td>
                    <td className="order-status-cell">
                      <Badge tone={order.status === 'Completed' ? 'success' : order.status === 'Cancelled' ? 'danger' : 'warning'}>{order.status}</Badge>
                    </td>
                    <td className="order-date-cell">{formatDate(order.createdAt)}</td>
                    <td>
                      <div className="product-row-actions order-row-actions">
                        <button type="button" onClick={() => setSelectedOrderId(order.id)}>View</button>
                        <button type="button" onClick={() => setInvoiceOrderId(order.id)}>Invoice</button>
                        <button type="button" onClick={() => setMoreOrderId(order.id)}>More</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <OrderDetailsModal order={selectedOrder} onClose={() => setSelectedOrderId(null)} />
      <InvoicePreviewModal order={invoiceOrder} onClose={() => setInvoiceOrderId(null)} />

      {moreOrder && (
        <div className="modal-backdrop" onClick={() => setMoreOrderId(null)}>
          <div className="confirmation-modal order-more-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{moreOrder.id}</h3>
            <div className="order-more-menu">
              <button type="button" onClick={() => { setSelectedOrderId(moreOrder.id); setMoreOrderId(null) }}>View Order</button>
              <button type="button" onClick={() => { setInvoiceOrderId(moreOrder.id); setMoreOrderId(null) }}>View Invoice</button>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(moreOrder.id); setMoreOrderId(null) }}>Copy Order ID</button>
            </div>
            <div className="confirmation-modal__actions">
              <Button variant="secondary" type="button" onClick={() => setMoreOrderId(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrdersPage

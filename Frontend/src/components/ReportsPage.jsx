import { useEffect, useMemo, useState } from 'react'
import Button from './ui/Button'
import Card from './ui/Card'
import Badge from './ui/Badge'
import { dateRangeOptions } from '../data/mockReports'
import { getDailySales } from '../services/api'
import { useCurrency } from '../context/CurrencyContext'

const defaultReport = {
  totalSales: 0,
  transactions: 0,
  salesTrend: [
    { label: 'Mon', value: 0 },
    { label: 'Tue', value: 0 },
    { label: 'Wed', value: 0 },
    { label: 'Thu', value: 0 },
    { label: 'Fri', value: 0 },
    { label: 'Sat', value: 0 },
    { label: 'Sun', value: 0 },
  ],
  paymentMethods: [
    { label: 'Cash', amount: 0, count: 0 },
    { label: 'Card', amount: 0, count: 0 },
    { label: 'Bank Transfer', amount: 0, count: 0 },
    { label: 'Other', amount: 0, count: 0 },
  ],
  topProducts: [],
  inventoryMovement: {
    received: 0,
    sold: 0,
    returned: 0,
    adjustments: 0,
  },
  returnsSummary: {
    totalReturns: 0,
    completedReturns: 0,
    pendingReturns: 0,
    refundValue: 0,
  },
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value || 0)
}

function ReportsPage() {
  const { formatCurrency } = useCurrency()
  const [selectedRange, setSelectedRange] = useState('Today')
  const [currentReport, setCurrentReport] = useState(defaultReport)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    setLoading(true)

    getDailySales()
      .then((res) => {
        if (!isMounted) return
        if (res?.ok && res.data?.success && res.data.data?.report) {
          const rep = res.data.data.report
          setCurrentReport({
            totalSales: rep.summary?.totalSales || 0,
            transactions: rep.summary?.transactionCount || 0,
            salesTrend: [
              { label: 'Mon', value: 0 },
              { label: 'Tue', value: 0 },
              { label: 'Wed', value: 0 },
              { label: 'Thu', value: 0 },
              { label: 'Fri', value: 0 },
              { label: 'Sat', value: 0 },
              { label: 'Sun', value: rep.summary?.totalSales || 0 },
            ],
            paymentMethods: rep.paymentMethods || defaultReport.paymentMethods,
            topProducts: rep.topProducts || [],
            inventoryMovement: {
              received: 0,
              sold: rep.summary?.transactionCount || 0,
              returned: rep.returns?.totalCount || 0,
              adjustments: 0,
            },
            returnsSummary: {
              totalReturns: rep.returns?.totalCount || 0,
              completedReturns: rep.returns?.completedCount || 0,
              pendingReturns: rep.returns?.pendingCount || 0,
              refundValue: rep.returns?.refundValue || 0,
            },
          })
        } else {
          setCurrentReport(defaultReport)
        }
      })
      .catch(() => {
        if (isMounted) setCurrentReport(defaultReport)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [selectedRange])

  const averageTransaction = useMemo(
    () => (currentReport.transactions > 0 ? currentReport.totalSales / currentReport.transactions : 0),
    [currentReport],
  )

  const highestSalesDay = useMemo(() => {
    if (!currentReport.salesTrend || currentReport.salesTrend.length === 0) {
      return { label: '—', value: 0 }
    }
    const trendValue = currentReport.salesTrend.reduce((max, item) => (item.value > max.value ? item : max), currentReport.salesTrend[0])
    return trendValue || { label: '—', value: 0 }
  }, [currentReport])

  const totalPaymentAmount = currentReport.paymentMethods.reduce((sum, item) => sum + Number(item.amount), 0)

  const handleExportReport = () => {
    const rows = [
      ['Report', 'Vantrix POS Report'],
      ['Date Range', selectedRange],
      ['Generated At', new Date().toISOString().slice(0, 10)],
      [],
      ['Section', 'Metric', 'Value'],
      ['Overview', 'Total Sales', formatCurrency(currentReport.totalSales)],
      ['Overview', 'Transactions', formatNumber(currentReport.transactions)],
      ['Overview', 'Average Transaction', formatCurrency(averageTransaction)],
      ['Overview', 'Total Refunds', formatCurrency(currentReport.returnsSummary.refundValue)],
      ['Sales', 'Highest Sales Day', `${highestSalesDay.label} (${formatCurrency(highestSalesDay.value)})`],
      ['Payments', 'Total Payment Volume', formatCurrency(totalPaymentAmount)],
      ['Returns', 'Total Returns', formatNumber(currentReport.returnsSummary.totalReturns)],
      ['Inventory', 'Stock Sold', formatNumber(currentReport.inventoryMovement.sold)],
    ]

    currentReport.paymentMethods.forEach((method) => {
      rows.push(['Payments', method.label, `${formatCurrency(method.amount)} (${method.count} tx)`])
    })

    currentReport.topProducts.forEach((product) => {
      rows.push(['Products', product.name, `${product.unitsSold} units · ${formatCurrency(product.revenue)}`])
    })

    const csvContent = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `vantrix-pos-report-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="reports-page">
      <header className="reports-page__header">
        <div>
          <span className="section-label">Operations Reporting</span>
          <h2>Reports</h2>
          <p>Analyze sales, revenue, payments, products, inventory movement, and returns.</p>
        </div>

        <div className="reports-page__actions">
          <label className="reports-range-control">
            <span>Date Range</span>
            <select value={selectedRange} onChange={(event) => setSelectedRange(event.target.value)}>
              {dateRangeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <Button variant="primary" type="button" onClick={handleExportReport}>Export Report</Button>
        </div>
      </header>

      <section className="reports-kpis">
        <Card className="reports-kpi-card">
          <span className="kpi-card__label">Total Sales</span>
          <strong className="kpi-card__value small">{formatCurrency(currentReport.totalSales)}</strong>
        </Card>

        <Card className="reports-kpi-card">
          <span className="kpi-card__label">Transactions</span>
          <strong className="kpi-card__value small">{formatNumber(currentReport.transactions)}</strong>
        </Card>

        <Card className="reports-kpi-card">
          <span className="kpi-card__label">Average Transaction</span>
          <strong className="kpi-card__value small">{formatCurrency(averageTransaction)}</strong>
        </Card>

        <Card className="reports-kpi-card">
          <span className="kpi-card__label">Total Refunds</span>
          <strong className="kpi-card__value small">{formatCurrency(currentReport.returnsSummary.refundValue)}</strong>
        </Card>
      </section>

      <div className="reports-grid">
        <Card title="Sales Performance" subtitle="Sales Trend" className="report-card report-card--sales">
          <div className="sales-performance">
            <div className="sales-performance__bars" aria-label="Sales trend chart">
              {currentReport.salesTrend.map((point) => {
                const maxValue = Math.max(...currentReport.salesTrend.map((item) => item.value), 1)
                const height = point.value > 0 ? Math.max((point.value / maxValue) * 100, 12) : 6

                return (
                  <div key={point.label} className="sales-performance__bar-wrap">
                    <div className="sales-performance__bar-track">
                      <span className="sales-performance__bar" style={{ height: `${height}%` }} />
                    </div>
                    <strong>{point.label}</strong>
                    <small>{formatCurrency(point.value)}</small>
                  </div>
                )
              })}
            </div>

            <div className="sales-performance__summary">
              <div className="report-stat">
                <span>Total Sales</span>
                <strong>{formatCurrency(currentReport.totalSales)}</strong>
              </div>
              <div className="report-stat">
                <span>Highest Sales Day</span>
                <strong>{highestSalesDay.label}</strong>
              </div>
              <div className="report-stat">
                <span>Transactions</span>
                <strong>{formatNumber(currentReport.transactions)}</strong>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Payment Methods" subtitle="Share of sales by channel" className="report-card report-card--payments">
          <div className="payment-methods">
            {currentReport.paymentMethods.map((method) => {
              const share = currentReport.totalSales > 0 ? (method.amount / currentReport.totalSales) * 100 : 0

              return (
                <div key={method.label} className="payment-method-item">
                  <div className="payment-method-item__header">
                    <div>
                      <strong>{method.label}</strong>
                      <small>{method.count} transactions</small>
                    </div>
                    <Badge tone={method.label === 'Card' ? 'success' : method.label === 'Cash' ? 'warning' : method.label === 'Bank Transfer' ? 'info' : 'default'}>{share.toFixed(1)}%</Badge>
                  </div>

                  <div className="payment-method-item__amount">
                    <span>{formatCurrency(method.amount)}</span>
                  </div>

                  <div className="progress-bar" aria-hidden="true">
                    <span style={{ width: `${share}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card title="Top Selling Products" subtitle="Best performers in the selected period" className="report-card report-card--top">
          <div className="products-table-wrap">
            <table className="products-table reports-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Units Sold</th>
                  <th>Revenue</th>
                  <th>Average Price</th>
                </tr>
              </thead>
              <tbody>
                {currentReport.topProducts.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                      No sales recorded for this period yet.
                    </td>
                  </tr>
                ) : (
                  currentReport.topProducts.map((product) => {
                    const averagePrice = product.unitsSold > 0 ? product.revenue / product.unitsSold : 0

                    return (
                      <tr key={product.sku || product.name}>
                        <td>{product.name}</td>
                        <td>{product.sku || '—'}</td>
                        <td>{formatNumber(product.unitsSold)}</td>
                        <td>{formatCurrency(product.revenue)}</td>
                        <td>{formatCurrency(averagePrice)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Inventory Movement" subtitle="Stock flow overview" className="report-card report-card--inventory">
          <div className="inventory-movement-grid">
            <div className="movement-stat">
              <span>Received</span>
              <strong>{formatNumber(currentReport.inventoryMovement.received)}</strong>
            </div>
            <div className="movement-stat">
              <span>Sold</span>
              <strong>{formatNumber(currentReport.inventoryMovement.sold)}</strong>
            </div>
            <div className="movement-stat">
              <span>Returned</span>
              <strong>{formatNumber(currentReport.inventoryMovement.returned)}</strong>
            </div>
            <div className="movement-stat">
              <span>Adjustments</span>
              <strong>{formatNumber(currentReport.inventoryMovement.adjustments)}</strong>
            </div>
          </div>
        </Card>

        <Card title="Returns Summary" subtitle="Return and refund snapshot" className="report-card report-card--returns">
          <div className="returns-summary-grid">
            <div className="movement-stat">
              <span>Total Returns</span>
              <strong>{formatNumber(currentReport.returnsSummary.totalReturns)}</strong>
            </div>
            <div className="movement-stat">
              <span>Completed Returns</span>
              <strong>{formatNumber(currentReport.returnsSummary.completedReturns)}</strong>
            </div>
            <div className="movement-stat">
              <span>Pending Returns</span>
              <strong>{formatNumber(currentReport.returnsSummary.pendingReturns)}</strong>
            </div>
            <div className="movement-stat">
              <span>Refund Value</span>
              <strong>{formatCurrency(currentReport.returnsSummary.refundValue)}</strong>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default ReportsPage

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import KPIStatCard from './KPIStatCard'
import Button from './ui/Button'
import QuickActions from './QuickActions'
import TransactionJournal from './TransactionJournal'
import StockAlerts from './StockAlerts'
import { getDashboardSummary } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useCurrency } from '../context/CurrencyContext'
import { paths } from '../paths'

function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { formatCurrency } = useCurrency()
  const [summary, setSummary] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)

    getDashboardSummary()
      .then((res) => {
        if (!isMounted) return
        if (res?.ok && res.data?.success) {
          setSummary(res.data.data?.summary || null)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const kpiStats = useMemo(() => {
    const grossSales = summary?.todaySales ?? 0
    const basketVal = summary?.averageBasketValue ?? 0
    const activeRegisters = summary?.registers?.active ?? 1
    const totalRegisters = summary?.registers?.total ?? 1
    const lowStockCount = summary?.lowStockCount ?? 0

    return [
      {
        label: 'Gross Store Revenue',
        value: formatCurrency(grossSales),
        delta: grossSales > 0 ? '+100%' : '0%',
        trend: grossSales > 0 ? 'up' : 'neutral',
        meta: 'today',
        tone: 'primary',
      },
      {
        label: 'Average Basket Value',
        value: formatCurrency(basketVal),
        delta: basketVal > 0 ? '+100%' : '0%',
        trend: basketVal > 0 ? 'up' : 'neutral',
        meta: 'today',
        tone: 'secondary',
      },
      {
        label: 'POS Registers Online',
        value: `${activeRegisters} of ${Math.max(activeRegisters, totalRegisters)}`,
        delta: 'Online',
        trend: 'neutral',
        meta: 'active',
        tone: 'info',
      },
      {
        label: 'Inventory Alerts',
        value: `${lowStockCount} SKUs`,
        delta: lowStockCount > 0 ? 'Alert' : 'Normal',
        trend: lowStockCount > 0 ? 'down' : 'neutral',
        meta: lowStockCount > 0 ? 'reorder review' : 'healthy stock',
        tone: lowStockCount > 0 ? 'danger' : 'success',
      },
    ]
  }, [summary, formatCurrency])

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero__info">
          <div className="dashboard-hero__label">{user?.storeName || 'Store Operations'}</div>
          <div className="dashboard-hero__meta">
            <span>🟢 Scanner Ready (GOM)</span>
            <span>Shift Started: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        <div className="dashboard-hero__actions">
          <Button variant="secondary" onClick={() => navigate(paths.pos)}>
            🛒 Quick Sale (POS)
          </Button>
          <Button variant="secondary" onClick={() => navigate(paths.orders)}>
            📦 Recent Orders
          </Button>
          <Button variant="secondary" onClick={() => navigate(paths.reports)}>
            📊 Shift Report
          </Button>
        </div>
      </section>

      <section className="kpi-grid">
        {kpiStats.map((stat) => (
          <KPIStatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="content-grid">
        <div className="content-grid__main">
          <QuickActions />
          <TransactionJournal transactions={summary?.recentTransactions || []} />
        </div>

        <aside className="content-grid__side">
          <StockAlerts alerts={summary?.lowStockAlerts || []} />
        </aside>
      </section>
    </div>
  )
}

export default DashboardPage

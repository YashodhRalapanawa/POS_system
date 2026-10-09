import { useNavigate } from 'react-router-dom'
import { kpiStats, banner } from '../data/mockDashboard'
import KPIStatCard from './KPIStatCard'
import Button from './ui/Button'
import QuickActions from './QuickActions'
import TransactionJournal from './TransactionJournal'
import StockAlerts from './StockAlerts'
import { paths } from '../paths'

function DashboardPage() {
  const navigate = useNavigate()

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero__info">
          <div className="dashboard-hero__label">Store #104 Downtown Flagship</div>
          <div className="dashboard-hero__meta">
            <span>🟢 Scanner Ready (GOM)</span>
            <span>Shift Started: 08:00 AM</span>
            <span>1h 14m elapsed</span>
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
          <TransactionJournal />
        </div>

        <aside className="content-grid__side">
          <StockAlerts />
        </aside>
      </section>
    </div>
  )
}

export default DashboardPage

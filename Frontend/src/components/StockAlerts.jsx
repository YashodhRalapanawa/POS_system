import Card from './ui/Card'
import Badge from './ui/Badge'
import { stockAlerts } from '../data/mockDashboard'

function StockAlerts() {
  return (
    <Card title="Stock Alerts" className="stock-alerts-card">
      <div className="stock-alerts-list">
        {stockAlerts.map((alert) => (
          <div key={alert.name} className="stock-alerts-item">
            <div className="stock-alerts-item__icon">◫</div>
            <div className="stock-alerts-item__content">
              <div className="stock-alerts-item__header">
                <strong>{alert.name}</strong>
                <Badge tone="warning">{alert.status}</Badge>
              </div>
              <div className="stock-alerts-item__meta">
                <span>{alert.qty}</span>
                <span>{alert.delta}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default StockAlerts

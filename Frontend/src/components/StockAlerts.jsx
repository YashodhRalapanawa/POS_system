import Card from './ui/Card'
import Badge from './ui/Badge'

function StockAlerts({ alerts = [] }) {
  return (
    <Card title="Stock Alerts" className="stock-alerts-card">
      <div className="stock-alerts-list">
        {alerts.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.25rem' }}>✓</span>
            No low stock alerts. All inventory levels healthy.
          </div>
        ) : (
          alerts.map((alert) => (
            <div key={alert.productId || alert.name} className="stock-alerts-item">
              <div className="stock-alerts-item__icon">◫</div>
              <div className="stock-alerts-item__content">
                <div className="stock-alerts-item__header">
                  <strong>{alert.name}</strong>
                  <Badge tone={alert.status === 'Out of stock' ? 'danger' : 'warning'}>{alert.status}</Badge>
                </div>
                <div className="stock-alerts-item__meta">
                  <span>{alert.availableQuantity !== undefined ? `${alert.availableQuantity} left` : alert.qty}</span>
                  {alert.sku && <span>SKU: {alert.sku}</span>}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}

export default StockAlerts

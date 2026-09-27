import Card from './ui/Card'
import Button from './ui/Button'

const actions = [
  { label: 'Lookup SKU', shortcut: '[F4]', icon: '⌕' },
  { label: 'Mgr Discount', shortcut: '[F6]', icon: '%' },
  { label: 'Gift Card', shortcut: '[F8]', icon: '🎫' },
  { label: 'Price Check', shortcut: '[F9]', icon: '₨' },
  { label: 'Recall Ticket', shortcut: '[F10]', icon: '↩' },
]

function QuickActions() {
  return (
    <Card title="Terminal Quick Actions" className="quick-actions-card">
      <div className="quick-actions-grid">
        {actions.map((action) => (
          <Button key={action.label} variant="secondary" className="quick-action-btn">
            <span className="quick-action-btn__icon">{action.icon}</span>
            <span className="quick-action-btn__content">
              <strong>{action.label}</strong>
              <small>{action.shortcut}</small>
            </span>
          </Button>
        ))}
      </div>
    </Card>
  )
}

export default QuickActions

import { useNavigate } from 'react-router-dom'
import Card from './ui/Card'
import Button from './ui/Button'
import { paths } from '../paths'

function QuickActions() {
  const navigate = useNavigate()

  const actions = [
    { label: 'Lookup SKU', shortcut: '[F4]', icon: '⌕', path: paths?.pos || '/pos' },
    { label: 'Mgr Discount', shortcut: '[F6]', icon: '%', path: paths?.pos || '/pos' },
    { label: 'Gift Card', shortcut: '[F8]', icon: '🎫', path: paths?.pos || '/pos' },
    { label: 'Price Check', shortcut: '[F9]', icon: '₨', path: paths?.products || '/products' },
    { label: 'Recall Ticket', shortcut: '[F10]', icon: '↩', path: paths?.orders || '/orders' },
  ]

  return (
    <Card title="Terminal Quick Actions" className="quick-actions-card">
      <div className="quick-actions-grid">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="secondary"
            className="quick-action-btn"
            onClick={() => navigate(action.path)}
          >
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

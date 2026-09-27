import Button from './ui/Button'
import Badge from './ui/Badge'

function formatDate(value) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDateTime(value) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function UserDetailsModal({ user, onClose }) {
  if (!user) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal product-details-modal user-details-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <div>
            <span className="section-label">Staff Account Details</span>
            <h3>{user.name}</h3>
          </div>
          <button type="button" className="modal__close" onClick={onClose}>×</button>
        </div>

        <div className="product-details-modal__content">
          <div className="product-details-modal__header-row">
            <span>Account Information</span>
            <Badge tone={user.status === 'Active' ? 'success' : 'warning'}>{user.status}</Badge>
          </div>

          <div className="product-details-modal__grid">
            <div className="modal__row"><span>Name</span><strong>{user.name}</strong></div>
            <div className="modal__row"><span>Email</span><strong>{user.email}</strong></div>
            <div className="modal__row"><span>Employee ID</span><strong>{user.employeeId}</strong></div>
            <div className="modal__row"><span>Role</span><strong>{user.role}</strong></div>
            <div className="modal__row"><span>Register Access</span><strong>{user.registerAccess}</strong></div>
            <div className="modal__row"><span>Status</span><strong>{user.status}</strong></div>
            <div className="modal__row"><span>Last Login</span><strong>{formatDateTime(user.lastLogin)}</strong></div>
            <div className="modal__row"><span>Created Date</span><strong>{formatDate(user.createdAt)}</strong></div>
          </div>
        </div>

        <div className="modal__actions">
          <Button variant="primary" type="button" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

export default UserDetailsModal

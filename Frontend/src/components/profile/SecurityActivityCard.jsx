import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getMockActivity } from '../../data/mockActivity'
import { paths } from '../../routes'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import Card from '../ui/Card'
import { describeDevice, formatDateTime } from './profileFormat'

const MAX_ACTIVITY = 6

function SignOutModal({ onCancel, onConfirm }) {
  const confirmRef = useRef(null)

  useEffect(() => {
    const previouslyFocused = document.activeElement
    confirmRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [onCancel])

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="confirmation-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="signout-title"
        aria-describedby="signout-text"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="signout-title">Sign out of Vantrix POS?</h3>
        <p id="signout-text">You&rsquo;ll need to sign in again to use the register or back office.</p>
        <div className="confirmation-modal__actions">
          <Button variant="secondary" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button ref={confirmRef} variant="primary" type="button" onClick={onConfirm}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}

function SecurityActivityCard({ user }) {
  const { activity, sessionStartedAt, logout } = useAuth()
  const navigate = useNavigate()
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Session entries first (newest), then mock history, newest first.
  const recentActivity = useMemo(
    () =>
      [...activity, ...getMockActivity(user)]
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
        .slice(0, MAX_ACTIVITY),
    [activity, user],
  )

  const closeConfirm = useCallback(() => setConfirmOpen(false), [])

  const signOut = () => {
    logout()
    navigate(paths.login, { replace: true })
  }

  return (
    <Card className="profile-card" title="Security & Activity" subtitle="Your current session and recent account activity.">
      <div className="profile-session">
        <div>
          <span className="profile-readonly__label">Current session</span>
          <div className="profile-session__device">
            <strong>{describeDevice()}</strong>
            <Badge tone="success">This device</Badge>
          </div>
          <span className="profile-readonly__helper">
            Signed in {sessionStartedAt ? formatDateTime(sessionStartedAt) : 'earlier (time not recorded)'}
          </span>
        </div>
        <Button variant="secondary" type="button" onClick={() => setConfirmOpen(true)}>
          Sign out
        </Button>
      </div>

      <h4 className="profile-subheading">Recent activity</h4>
      <ul className="profile-activity">
        {recentActivity.map((entry) => (
          <li key={entry.id}>
            <div>
              <span className="profile-activity__action">{entry.action}</span>
              {entry.detail && <span className="profile-activity__detail">{entry.detail}</span>}
            </div>
            <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
          </li>
        ))}
      </ul>

      {confirmOpen && <SignOutModal onCancel={closeConfirm} onConfirm={signOut} />}
    </Card>
  )
}

export default SecurityActivityCard

import { useEffect, useRef, useState } from 'react'
import Button from '../ui/Button'

// Signs the user out after a period without activity, warning shortly before.
// Set VITE_IDLE_TIMEOUT_MINUTES (e.g. in .env.local) to shorten it for testing.
const configuredMinutes = Number.parseFloat(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES)
const IDLE_TIMEOUT_MS = (Number.isFinite(configuredMinutes) && configuredMinutes > 0 ? configuredMinutes : 30) * 60 * 1000
const WARNING_MS = Math.min(60 * 1000, IDLE_TIMEOUT_MS / 2)
const CHECK_INTERVAL_MS = 1000

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll']

function InactivityGuard({ onTimeout, onSignOut }) {
  const lastActivityRef = useRef(0)
  const warningRef = useRef(false)
  const stayButtonRef = useRef(null)
  const [secondsLeft, setSecondsLeft] = useState(null)

  useEffect(() => {
    lastActivityRef.current = Date.now()

    // While the warning is open, only "Stay signed in" keeps the session.
    const recordActivity = () => {
      if (!warningRef.current) lastActivityRef.current = Date.now()
    }
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, recordActivity, { passive: true }))

    // Elapsed time is measured from timestamps, so throttled background tabs stay accurate.
    const intervalId = window.setInterval(() => {
      const remaining = IDLE_TIMEOUT_MS - (Date.now() - lastActivityRef.current)
      if (remaining <= 0) {
        onTimeout()
        return
      }
      if (remaining <= WARNING_MS) {
        warningRef.current = true
        setSecondsLeft(Math.ceil(remaining / 1000))
      }
    }, CHECK_INTERVAL_MS)

    return () => {
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, recordActivity))
      window.clearInterval(intervalId)
    }
  }, [onTimeout])

  const warningOpen = secondsLeft !== null

  useEffect(() => {
    if (warningOpen) stayButtonRef.current?.focus()
  }, [warningOpen])

  const staySignedIn = () => {
    warningRef.current = false
    lastActivityRef.current = Date.now()
    setSecondsLeft(null)
  }

  if (!warningOpen) return null

  return (
    <div className="modal-backdrop inactivity-backdrop">
      <div
        className="confirmation-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="inactivity-title"
        aria-describedby="inactivity-text"
      >
        <h3 id="inactivity-title">You will be signed out due to inactivity</h3>
        <p id="inactivity-text">
          For security, your session ends in <strong>{secondsLeft}</strong> second{secondsLeft === 1 ? '' : 's'}.
        </p>
        <div className="confirmation-modal__actions">
          <Button variant="secondary" type="button" onClick={onSignOut}>
            Sign out now
          </Button>
          <Button ref={stayButtonRef} variant="primary" type="button" onClick={staySignedIn}>
            Stay signed in
          </Button>
        </div>
      </div>
    </div>
  )
}

export default InactivityGuard

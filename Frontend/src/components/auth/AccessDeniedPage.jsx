import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { paths } from '../../routes'
import Button from '../ui/Button'

function AccessDeniedPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <section className="status-page" aria-labelledby="access-denied-title">
      <div className="status-page__card">
        <span className="status-page__code status-page__code--denied">403</span>
        <h2 id="access-denied-title">Access denied</h2>
        <p>
          Your role ({user?.role}) does not have permission to view this page. Contact your administrator if you need
          access.
        </p>
        <Button type="button" onClick={() => navigate(paths.dashboard)}>
          Go to Dashboard
        </Button>
      </div>
    </section>
  )
}

export default AccessDeniedPage

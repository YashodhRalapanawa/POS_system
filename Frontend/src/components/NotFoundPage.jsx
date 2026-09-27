import { useLocation, useNavigate } from 'react-router-dom'
import { paths } from '../routes'
import Button from './ui/Button'

function NotFoundPage() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <section className="status-page" aria-labelledby="not-found-title">
      <div className="status-page__card">
        <span className="status-page__code">404</span>
        <h2 id="not-found-title">Page not found</h2>
        <p>
          There is no page at <code>{location.pathname}</code>. Check the address or use the navigation to find what
          you need.
        </p>
        <Button type="button" onClick={() => navigate(paths.dashboard)}>
          Go to Dashboard
        </Button>
      </div>
    </section>
  )
}

export default NotFoundPage

import { Link } from 'react-router-dom'
import { paths } from '../../routes'
import AuthBrand from './AuthBrand'

export default function ForgotPasswordPage() {
  return (
    <div className="auth-page"><div className="auth-page__inner">
      <section className="auth-card" aria-labelledby="auth-title">
        <AuthBrand />
        <h1 id="auth-title" className="auth-card__title">Password assistance</h1>
        <p>Contact your administrator to reset your staff account password. Self-service password reset is not available yet.</p>
        <Link to={paths.login} className="auth-link">Back to Sign In</Link>
      </section>
    </div></div>
  )
}

function AuthBrand() {
  return (
    <div className="auth-card__brand">
      <span className="auth-card__logo" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12l4 6-10 12L2 9z" />
          <path d="M11 3v6" />
          <path d="M13 3v6" />
        </svg>
      </span>
      <span className="auth-card__wordmark">
        Vantrix <strong>POS</strong>
      </span>
    </div>
  )
}

export default AuthBrand

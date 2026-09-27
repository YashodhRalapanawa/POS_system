function Card({ children, className = '', title, subtitle, headerAction }) {
  return (
    <section className={`card ${className}`.trim()}>
      {(title || subtitle || headerAction) && (
        <div className="card__header">
          <div>
            {title && <h3 className="card__title">{title}</h3>}
            {subtitle && <p className="card__subtitle">{subtitle}</p>}
          </div>
          {headerAction}
        </div>
      )}
      <div className="card__body">{children}</div>
    </section>
  )
}

export default Card

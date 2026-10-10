function PlaceholderPage({ title = 'Page' }) {
  return (
    <section className="placeholder-page">
      <div className="placeholder-page__card">
        <span className="placeholder-page__eyebrow">Vantrix POS</span>
        <h2>{title}</h2>
        <p>This section is ready for implementation.</p>
      </div>
    </section>
  )
}

export default PlaceholderPage

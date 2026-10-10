import Card from './ui/Card'

function KPIStatCard({ label, value, delta, meta, tone = 'primary' }) {
  const trendClass = delta.includes('Critical') ? 'negative' : delta.includes('-') ? 'negative' : 'positive'

  return (
    <Card className={`kpi-card kpi-card--${tone}`}>
      <div className="kpi-card__label">{label}</div>
      <div className="kpi-card__value">{value}</div>
      <div className="kpi-card__footer">
        <span className={`kpi-card__delta kpi-card__delta--${trendClass}`}>{delta}</span>
        <span className="kpi-card__meta">{meta}</span>
      </div>
    </Card>
  )
}

export default KPIStatCard

function Badge({ children, tone = 'default', className = '' }) {
  return <span className={`badge badge--${tone} ${className}`.trim()}>{children}</span>
}

export default Badge

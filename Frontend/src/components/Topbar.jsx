import { topbarActions } from '../data/mockDashboard'

function Topbar() {
  return (
    <header className="topbar">
      <div className="topbar__left">
        <div className="topbar__title-group">
          <span className="topbar__eyebrow">Store</span>
          <h1>Store Operations Overview</h1>
        </div>
      </div>

      <div className="topbar__right">
        {topbarActions.map((label) => (
          <button key={label} type="button" className="topbar__action">
            {label}
          </button>
        ))}
        <div className="topbar__user">
          <div className="avatar">SJ</div>
          <div className="user-meta">
            <span>Sarah Jenkins</span>
            <small>Manager</small>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Topbar

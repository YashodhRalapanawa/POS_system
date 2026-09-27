import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import AppRoutes from '../routes'

function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-panel">
        <Topbar />
        <AppRoutes />
        <Outlet />
      </main>
    </div>
  )
}

export default AppShell

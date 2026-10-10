import './App.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { useEffect } from 'react'
import AppShell from './components/AppShell'
import LoginPage from './components/auth/LoginPage'
import SignUpPage from './components/auth/SignUpPage'
import ForgotPasswordPage from './components/auth/ForgotPasswordPage'
import ProtectedRoute, { PublicOnlyRoute } from './components/auth/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { CurrencyProvider } from './context/CurrencyContext'
import { paths } from './routes'
import { applyTheme, getSavedThemeName } from './data/themeConfig'

const publicRoutes = [
  { path: paths.login, element: <LoginPage /> },
  { path: paths.signup, element: <SignUpPage /> },
  { path: paths.forgotPassword, element: <ForgotPasswordPage /> },
]

function App() {
  useEffect(() => {
    applyTheme(getSavedThemeName())
  }, [])

  return (
    <AuthProvider>
      <CurrencyProvider>
        <BrowserRouter>
          <Routes>
            {/* Public auth pages render outside the shell (no Sidebar/Topbar). */}
            {publicRoutes.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={<PublicOnlyRoute>{route.element}</PublicOnlyRoute>}
              />
            ))}
            {/* Every existing app route lives inside AppShell and requires a session. */}
            <Route
              path="*"
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </CurrencyProvider>
    </AuthProvider>
  )
}

export default App

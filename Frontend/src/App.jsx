import './App.css'
import { BrowserRouter } from 'react-router-dom'
import { useEffect } from 'react'
import AppShell from './components/AppShell'
import { applyTheme, getSavedThemeName } from './data/themeConfig'

function App() {
  useEffect(() => {
    applyTheme(getSavedThemeName())
  }, [])

  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App

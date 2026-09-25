export const THEME_STORAGE_KEY = 'vantrix-pos-theme'

export const themeOptions = [
  { value: 'Vantrix Blue', token: 'vantrix-blue' },
  { value: 'Industrial Steel', token: 'industrial-steel' },
  { value: 'Classic 3D POS', token: 'classic-3d-pos' },
  { value: 'Blue 3D Terminal', token: 'blue-3d-terminal' },
  { value: 'Teal 3D Terminal', token: 'teal-3d-terminal' },
  { value: 'Silver 3D POS', token: 'silver-3d-pos' },
]

export const defaultThemeName = 'Vantrix Blue'

export function getThemeToken(themeName = defaultThemeName) {
  const theme = themeOptions.find((option) => option.value === themeName)
  return theme ? theme.token : 'vantrix-blue'
}

export function getSavedThemeName() {
  if (typeof window === 'undefined') return defaultThemeName

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  const isValidTheme = themeOptions.some((option) => option.value === savedTheme)

  if (!isValidTheme) {
    window.localStorage.setItem(THEME_STORAGE_KEY, defaultThemeName)
    return defaultThemeName
  }

  return savedTheme
}

export function applyTheme(themeName = defaultThemeName) {
  if (typeof document === 'undefined') return

  const themeToken = getThemeToken(themeName)
  document.documentElement.setAttribute('data-theme', themeToken)
}

export function persistTheme(themeName = defaultThemeName) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(THEME_STORAGE_KEY, themeName)
  applyTheme(themeName)
}

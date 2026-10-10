import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getRoutePermission, paths, routeDefinitions } from '../../routes'
import Button from '../ui/Button'
import Card from '../ui/Card'

// Each format is shown as an example date.
const dateFormatOptions = [
  { value: 'MMM D, YYYY', example: 'Sep 26, 2026' },
  { value: 'DD/MM/YYYY', example: '26/09/2026' },
  { value: 'YYYY-MM-DD', example: '2026-09-26' },
]

const densityOptions = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
]

function samePreferences(a, b) {
  return Object.keys({ ...a, ...b }).every((key) => a[key] === b[key])
}

function PreferencesCard() {
  const { preferences, defaultPreferences, updatePreferences, hasPermission } = useAuth()

  // Landing page choices are limited to screens this role can open.
  const landingOptions = routeDefinitions.filter(
    (route) => route.path !== paths.profile && hasPermission(getRoutePermission(route.path)),
  )
  const normalize = (prefs) => ({
    ...prefs,
    landingPage: landingOptions.some((route) => route.path === prefs.landingPage) ? prefs.landingPage : paths.dashboard,
  })

  const [draft, setDraft] = useState(() => normalize(preferences))
  const [message, setMessage] = useState('')

  const saved = normalize(preferences)
  const isDirty = !samePreferences(draft, saved)

  const setField = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setMessage('')
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    updatePreferences(draft)
    setMessage('Preferences saved.')
  }

  const resetToDefaults = () => {
    const defaults = normalize(defaultPreferences)
    setDraft(defaults)
    updatePreferences(defaults)
    setMessage('Preferences reset to defaults.')
  }

  return (
    <Card className="profile-card" title="Preferences" subtitle="Personal settings for how Vantrix POS works for you.">
      <form className="profile-form" onSubmit={handleSubmit}>
        <div className="profile-grid">
          <div className="profile-field">
            <label htmlFor="pref-landing">Default landing page after login</label>
            <select
              id="pref-landing"
              value={draft.landingPage}
              onChange={(event) => setField('landingPage', event.target.value)}
            >
              {landingOptions.map((route) => (
                <option key={route.path} value={route.path}>
                  {route.label}
                </option>
              ))}
            </select>
          </div>

          <div className="profile-field">
            <label htmlFor="pref-date">Date format</label>
            <select id="pref-date" value={draft.dateFormat} onChange={(event) => setField('dateFormat', event.target.value)}>
              {dateFormatOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.example}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="profile-toggles">
          <label className="profile-switch">
            <input
              type="checkbox"
              role="switch"
              checked={draft.askBeforePrinting}
              onChange={(event) => setField('askBeforePrinting', event.target.checked)}
            />
            <span className="profile-switch__track" aria-hidden="true" />
            <span>Ask before printing receipts</span>
          </label>
          <label className="profile-switch">
            <input
              type="checkbox"
              role="switch"
              checked={draft.saleSound}
              onChange={(event) => setField('saleSound', event.target.checked)}
            />
            <span className="profile-switch__track" aria-hidden="true" />
            <span>Play sound on successful sale</span>
          </label>
        </div>

        <fieldset className="profile-segmented">
          <legend>Table density</legend>
          <div className="profile-segmented__options">
            {densityOptions.map((option) => (
              <label key={option.value} className={draft.tableDensity === option.value ? 'is-selected' : ''}>
                <input
                  type="radio"
                  name="pref-density"
                  value={option.value}
                  checked={draft.tableDensity === option.value}
                  onChange={() => setField('tableDensity', option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="profile-note">Some preferences will apply across screens in a future update.</p>

        {message && (
          <div className="auth-alert auth-alert--success profile-alert" role="status">
            {message}
          </div>
        )}

        <div className="profile-actions profile-actions--split">
          <button type="button" className="auth-link" onClick={resetToDefaults}>
            Reset to Defaults
          </button>
          <Button type="submit" disabled={!isDirty}>
            Save Preferences
          </Button>
        </div>
      </form>
    </Card>
  )
}

export default PreferencesCard

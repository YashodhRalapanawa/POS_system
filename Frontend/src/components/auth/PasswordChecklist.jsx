import { getPasswordStrength, passwordRules } from './passwordRules'

function PasswordChecklist({ id, value }) {
  const strength = getPasswordStrength(value)

  return (
    <div id={id} className="auth-password-help">
      <div className="auth-strength" aria-live="polite">
        <div className="auth-strength__bar" aria-hidden="true">
          {[1, 2, 3].map((segment) => (
            <span
              key={segment}
              className={`auth-strength__segment${
                strength && segment <= strength.level ? ` auth-strength__segment--${strength.level}` : ''
              }`}
            />
          ))}
        </div>
        <span className="auth-strength__label">
          {strength ? `Strength: ${strength.label}` : 'Strength: —'}
        </span>
      </div>

      <ul className="auth-checklist">
        {passwordRules.map((rule) => {
          const met = rule.test(value)
          return (
            <li key={rule.id} className={met ? 'is-met' : ''}>
              <span className="auth-checklist__icon" aria-hidden="true">{met ? '✓' : '•'}</span>
              {rule.label}
              <span className="auth-sr-only">{met ? ' (met)' : ' (not met)'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default PasswordChecklist

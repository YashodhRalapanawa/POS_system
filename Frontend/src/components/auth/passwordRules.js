export const passwordRules = [
  { id: 'length', label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter', test: (value) => /[A-Z]/.test(value) },
  { id: 'number', label: 'One number', test: (value) => /[0-9]/.test(value) },
  { id: 'special', label: 'One special character', test: (value) => /[^A-Za-z0-9]/.test(value) },
]

export function meetsPasswordRules(value) {
  return passwordRules.every((rule) => rule.test(value))
}

// Simple heuristic: all rules plus 12+ characters is Strong.
export function getPasswordStrength(value) {
  if (!value) return null
  const met = passwordRules.filter((rule) => rule.test(value)).length
  if (met === passwordRules.length && value.length >= 12) return { level: 3, label: 'Strong' }
  if (met >= 3) return { level: 2, label: 'Fair' }
  return { level: 1, label: 'Weak' }
}

// Shared message for the password field on sign-up and reset.
export function validateNewPassword(value) {
  if (!value) return 'Password is required.'
  if (!meetsPasswordRules(value)) return 'Password does not meet all the requirements below.'
  return ''
}

export function validateConfirmPassword(password, confirm) {
  if (!confirm) return 'Please confirm your password.'
  if (password !== confirm) return 'Passwords do not match.'
  return ''
}

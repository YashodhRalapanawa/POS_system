// Mock account activity for the My Profile screen. Will be replaced by the
// backend audit log.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const activityTemplates = [
  { offset: 0, action: 'Signed in', detail: 'Chrome on Windows · Register terminal' },
  { offset: 9 * HOUR, action: 'Signed out', detail: 'End of shift' },
  { offset: 1 * DAY, action: 'Signed in', detail: 'Chrome on Windows · Register terminal' },
  { offset: 3 * DAY, action: 'Profile updated', detail: 'Phone number changed' },
  { offset: 6 * DAY, action: 'Password changed', detail: 'Changed from My Profile' },
  { offset: 6 * DAY + 2 * HOUR, action: 'Failed sign-in attempt', detail: 'Incorrect password' },
]

// Entries are placed relative to the user's last login so they look recent.
export function getMockActivity(user) {
  if (!user) return []
  const anchor = Date.parse(user.lastLogin) || Date.now()
  return activityTemplates.map((entry, index) => ({
    id: `${user.id}-mock-${index}`,
    action: entry.action,
    detail: entry.detail,
    at: new Date(anchor - entry.offset).toISOString(),
  }))
}

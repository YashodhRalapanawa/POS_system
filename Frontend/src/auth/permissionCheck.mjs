export function hasPermission(user, permission) {
  if (!user) return false
  if (!permission) return true

  if (user.status !== 'Active' || user.isActive === false) return false
  // Match the backend's explicit Admin exception; other roles use server permissions only.
  const code = user.roleCode || user.role?.code || user.role
  if (String(code).toUpperCase() === 'ADMIN') return true
  return Array.isArray(user.permissions) && user.permissions.includes(permission)
}


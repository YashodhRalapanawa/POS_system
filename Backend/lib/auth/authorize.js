import "server-only";
import { extractBearerToken, verifyUserToken, createUserClient } from "../supabase/server.js";
import { loadStaffProfile } from "../supabase/profile.js";

/**
 * Standard business role identifiers.
 * Database stores: "Admin", "Manager", "Cashier".
 */
export const ROLES = Object.freeze({
    ADMIN: "ADMIN",
    MANAGER: "MANAGER",
    CASHIER: "CASHIER",
});

/**
 * Normalizes a role value to uppercase string for safe comparisons.
 */
export function normalizeRole(role) {
    if (!role) return "";
    if (typeof role === "object" && role !== null) {
        return String(role.code || role.name || "").trim().toUpperCase();
    }
    return String(role).trim().toUpperCase();
}

/**
 * Checks whether a given user or role matches the allowed roles.
 * Supports single role or array of allowed roles.
 */
export function hasRole(userOrRole, allowedRoles = []) {
    const roleValue = typeof userOrRole === "object" && userOrRole !== null
        ? userOrRole.role
        : userOrRole;

    const normalizedUserRole = normalizeRole(roleValue);
    if (!normalizedUserRole) return false;

    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    const normalizedAllowed = allowed.map(normalizeRole);

    return normalizedAllowed.includes(normalizedUserRole);
}

/**
 * Pure authorization check for an already loaded user profile.
 * Returns { authorized: boolean, reason?: string }.
 */
export function authorizeRole(user, allowedRoles = []) {
    if (!user) {
        return { authorized: false, reason: "User profile not provided." };
    }

    if (user.status !== "Active" || user.isActive === false) {
        return { authorized: false, reason: "User account is inactive." };
    }

    if (!hasRole(user, allowedRoles)) {
        return { authorized: false, reason: "Insufficient role permissions." };
    }

    return { authorized: true };
}

/**
 * Complete server-side authentication and role authorization pipeline for Route Handlers.
 * Flow:
 *  1. Extract Bearer token from Authorization header (401 on missing)
 *  2. Verify token with Supabase Auth (401 on invalid/expired)
 *  3. Create user-scoped Supabase client with RLS headers
 *  4. Load staff profile from public.users (404 on not found)
 *  5. Check active status (403 on inactive)
 *  6. Check role against allowedRoles (403 on role mismatch)
 *
 * Returns:
 *  - On failure: { authorized: false, response: Response }
 *  - On success: { authorized: true, user: staffProfile, client: userScopedDb, token: string }
 */
export async function requireAuthAndRole(request, allowedRoles = []) {
    // 1. Read token
    const token = extractBearerToken(request);
    if (!token) {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "Authentication required" },
                { status: 401 }
            ),
        };
    }

    // 2. Verify token
    const { user: authUser, error: authError } = await verifyUserToken(token);
    if (authError || !authUser) {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "Invalid or expired authentication token" },
                { status: 401 }
            ),
        };
    }

    // 3. User-scoped client
    const client = createUserClient(token);

    // 4. Load staff profile
    let profile;
    try {
        profile = await loadStaffProfile(client, authUser.id);
    } catch {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "Failed to load staff profile" },
                { status: 500 }
            ),
        };
    }

    if (!profile) {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "Staff profile not found" },
                { status: 404 }
            ),
        };
    }

    // 5. Active check
    if (profile.status !== "Active" || profile.isActive === false) {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "User account is inactive" },
                { status: 403 }
            ),
        };
    }

    // 6. Role check
    if (allowedRoles && allowedRoles.length > 0 && !hasRole(profile, allowedRoles)) {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "Forbidden" },
                { status: 403 }
            ),
        };
    }

    return {
        authorized: true,
        user: profile,
        client,
        token,
    };
}

/**
 * Checks whether a staff profile has a specific permission key.
 * Also grants all permissions to the system Admin role as a safe bootstrap fallback.
 */
export function hasPermission(user, permissionKey) {
    if (!user) return false;
    if (user.status !== "Active" || user.isActive === false) return false;

    // Direct permission check from user's assigned role permissions
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    if (Array.isArray(permissionKey)) {
        if (permissionKey.some((k) => permissions.includes(k))) {
            return true;
        }
    } else if (permissions.includes(permissionKey)) {
        return true;
    }

    // Bootstrap fallback: System Admin is granted full administrative access
    if (normalizeRole(user.role) === "ADMIN") {
        return true;
    }

    return false;
}

/**
 * Authorization check for permission on an already loaded staff profile.
 * Returns { authorized: boolean, reason?: string }.
 */
export function authorizePermission(user, permissionKey) {
    if (!user) {
        return { authorized: false, reason: "User profile not provided." };
    }
    if (user.status !== "Active" || user.isActive === false) {
        return { authorized: false, reason: "User account is inactive." };
    }
    if (!hasPermission(user, permissionKey)) {
        const keyDesc = Array.isArray(permissionKey) ? permissionKey.join(" or ") : permissionKey;
        return { authorized: false, reason: `Missing required permission: ${keyDesc}` };
    }
    return { authorized: true };
}

/**
 * Complete server-side authentication and permission authorization pipeline for Route Handlers.
 * Flow:
 *  1. Extract Bearer token (401 on missing)
 *  2. Verify token with Supabase Auth (401 on invalid/expired)
 *  3. Create user-scoped client with RLS
 *  4. Load staff profile from public.users (404 on not found)
 *  5. Check active status (403 on inactive)
 *  6. Check permission (403 on missing permission)
 *
 * Returns:
 *  - On failure: { authorized: false, response: Response }
 *  - On success: { authorized: true, user: staffProfile, client: userScopedDb, token: string }
 */
export async function requireAuthAndPermission(request, permissionKey) {
    const token = extractBearerToken(request);
    if (!token) {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "Authentication required" },
                { status: 401 }
            ),
        };
    }

    const { user: authUser, error: authError } = await verifyUserToken(token);
    if (authError || !authUser) {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "Invalid or expired authentication token" },
                { status: 401 }
            ),
        };
    }

    const client = createUserClient(token);

    let profile;
    try {
        profile = await loadStaffProfile(client, authUser.id);
    } catch {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "Failed to load staff profile" },
                { status: 500 }
            ),
        };
    }

    if (!profile) {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "Staff profile not found" },
                { status: 404 }
            ),
        };
    }

    if (profile.status !== "Active" || profile.isActive === false) {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "User account is inactive" },
                { status: 403 }
            ),
        };
    }

    if (!hasPermission(profile, permissionKey)) {
        return {
            authorized: false,
            response: Response.json(
                { success: false, message: "Forbidden: insufficient permissions" },
                { status: 403 }
            ),
        };
    }

    return {
        authorized: true,
        user: profile,
        client,
        token,
    };
}


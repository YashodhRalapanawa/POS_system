import { requireAuthAndPermission } from "../../../../../lib/auth/authorize.js";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../../lib/supabase/admin.js";

export const dynamic = "force-dynamic";

/**
 * Critical permissions required by system Admin to avoid lockout
 */
const CRITICAL_ADMIN_PERMISSIONS = ["roles.view", "roles.create", "roles.assign_permissions"];

/**
 * Helper to derive readable permission name if not stored in DB
 */
function derivePermissionName(key) {
    if (!key) return "";
    const parts = key.split(".");
    if (parts.length === 2) {
        const [module, action] = parts;
        const formattedAction = action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const formattedModule = module.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return `${formattedAction} ${formattedModule}`;
    }
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Helper to derive module name if not stored in DB
 */
function derivePermissionModule(key) {
    if (!key) return "General";
    const parts = key.split(".");
    if (parts.length > 1) {
        return parts[0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return "General";
}

/**
 * Validates and extracts roleId from route params
 */
async function resolveRoleId(context) {
    const params = await context?.params;
    const rawId = params?.id;
    const roleId = Number.parseInt(rawId, 10);
    if (!Number.isInteger(roleId) || roleId <= 0) {
        return { valid: false, roleId: null, rawId };
    }
    return { valid: true, roleId, rawId };
}

/**
 * GET /api/roles/[id]/permissions
 * Retrieves role details and all permissions assigned to that role.
 * Requires "roles.view" permission.
 */
export async function GET(request, context) {
    try {
        const auth = await requireAuthAndPermission(request, "roles.view");
        if (!auth.authorized) {
            return auth.response;
        }

        const { valid, roleId } = await resolveRoleId(context);
        if (!valid) {
            return Response.json(
                { success: false, message: "Invalid role ID format. Role ID must be a positive integer." },
                { status: 400 }
            );
        }

        // Query role information
        const { data: role, error: roleError } = await auth.client
            .from("roles")
            .select("id, name, code, is_system, is_active")
            .eq("id", roleId)
            .maybeSingle();

        if (roleError) {
            // Fallback if code/is_system columns are not present
            const { data: fallbackRole, error: fallbackError } = await auth.client
                .from("roles")
                .select("id, name")
                .eq("id", roleId)
                .maybeSingle();

            if (fallbackError || !fallbackRole) {
                return Response.json(
                    { success: false, message: "Role not found." },
                    { status: 404 }
                );
            }
        }

        if (!role) {
            return Response.json(
                { success: false, message: "Role not found." },
                { status: 404 }
            );
        }

        // Fetch assigned permissions
        const { data: rolePerms, error: permError } = await auth.client
            .from("role_permissions")
            .select(`
                permission_id,
                permission:permissions (id, key, description, module, name)
            `)
            .eq("role_id", roleId);

        let assignedPermissions = [];
        if (!permError && rolePerms) {
            assignedPermissions = rolePerms
                .map((rp) => rp.permission)
                .filter(Boolean)
                .map((p) => ({
                    id: p.id,
                    code: p.key,
                    key: p.key,
                    name: p.name || derivePermissionName(p.key),
                    module: p.module || derivePermissionModule(p.key),
                    description: p.description || "",
                }));
        } else {
            // Fallback for flat query if joined query is restricted
            const { data: rpList } = await auth.client
                .from("role_permissions")
                .select("permission_id")
                .eq("role_id", roleId);

            const permIds = (rpList || []).map((r) => r.permission_id);
            if (permIds.length > 0) {
                const { data: pList } = await auth.client
                    .from("permissions")
                    .select("id, key, description")
                    .in("id", permIds);

                assignedPermissions = (pList || []).map((p) => ({
                    id: p.id,
                    code: p.key,
                    key: p.key,
                    name: derivePermissionName(p.key),
                    module: derivePermissionModule(p.key),
                    description: p.description || "",
                }));
            }
        }

        return Response.json(
            {
                success: true,
                message: "Role permissions retrieved successfully",
                data: {
                    role: {
                        id: role.id,
                        name: role.name,
                        code: role.code || role.name.toUpperCase().replace(/\s+/g, "_"),
                    },
                    permissions: assignedPermissions,
                },
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Something went wrong while retrieving role permissions." },
            { status: 500 }
        );
    }
}

/**
 * PUT /api/roles/[id]/permissions
 * Replaces the complete permission set for the specified role.
 * Requires "roles.assign_permissions" (or "roles.manage") permission.
 */
export async function PUT(request, context) {
    try {
        const auth = await requireAuthAndPermission(request, ["roles.assign_permissions", "roles.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const { valid, roleId } = await resolveRoleId(context);
        if (!valid) {
            return Response.json(
                { success: false, message: "Invalid role ID format. Role ID must be a positive integer." },
                { status: 400 }
            );
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return Response.json(
                { success: false, message: "Invalid JSON request body." },
                { status: 400 }
            );
        }

        if (!body || !Array.isArray(body.permissionIds)) {
            return Response.json(
                { success: false, message: "permissionIds must be an array." },
                { status: 400 }
            );
        }

        // Validate individual permission IDs format
        const parsedIds = [];
        for (const rawId of body.permissionIds) {
            const num = Number(rawId);
            if (!Number.isInteger(num) || num <= 0) {
                return Response.json(
                    {
                        success: false,
                        message: `Invalid permission ID format: '${rawId}'. Permission IDs must be positive integers.`,
                    },
                    { status: 400 }
                );
            }
            parsedIds.push(num);
        }

        // Normalize / deduplicate IDs safely
        const uniquePermissionIds = [...new Set(parsedIds)];

        if (!isSupabaseAdminConfigured()) {
            return Response.json(
                { success: false, message: "Server database configuration is missing." },
                { status: 503 }
            );
        }

        const admin = getSupabaseAdmin();

        // 1. Verify role exists
        const { data: role, error: roleError } = await admin
            .from("roles")
            .select("id, name, code, is_system, is_active")
            .eq("id", roleId)
            .maybeSingle();

        if (roleError) {
            return Response.json(
                { success: false, message: "Failed to verify role." },
                { status: 500 }
            );
        }

        if (!role) {
            return Response.json(
                { success: false, message: "Role not found." },
                { status: 404 }
            );
        }

        if (role.is_active === false) {
            return Response.json(
                { success: false, message: "Cannot assign permissions to an inactive role." },
                { status: 400 }
            );
        }

        // 2. Validate all permission IDs exist in public.permissions
        if (uniquePermissionIds.length > 0) {
            const { data: existingPerms, error: permsError } = await admin
                .from("permissions")
                .select("id, key")
                .in("id", uniquePermissionIds);

            if (permsError) {
                return Response.json(
                    { success: false, message: "Failed to verify permission IDs." },
                    { status: 500 }
                );
            }

            const existingIds = new Set((existingPerms || []).map((p) => p.id));
            const missingIds = uniquePermissionIds.filter((id) => !existingIds.has(id));

            if (missingIds.length > 0) {
                return Response.json(
                    {
                        success: false,
                        message: `One or more permission IDs do not exist: [${missingIds.join(", ")}].`,
                    },
                    { status: 400 }
                );
            }
        }

        // 3. System Role Protection (Admin)
        // Prevent accidental removal of critical permissions from the Admin role
        const isAdminRole =
            role.name?.toLowerCase() === "admin" ||
            role.code?.toUpperCase() === "ADMIN" ||
            (role.is_system && role.name?.toLowerCase() === "admin");

        if (isAdminRole) {
            const { data: criticalPerms } = await admin
                .from("permissions")
                .select("id, key")
                .in("key", CRITICAL_ADMIN_PERMISSIONS);

            const missingCritical = (criticalPerms || [])
                .filter((cp) => CRITICAL_ADMIN_PERMISSIONS.includes(cp.key))
                .filter((cp) => !uniquePermissionIds.includes(cp.id));

            if (missingCritical.length > 0) {
                const missingNames = missingCritical.map((cp) => cp.key).join(", ");
                return Response.json(
                    {
                        success: false,
                        message: `Cannot remove critical administrative permissions (${missingNames}) from the Admin role.`,
                    },
                    { status: 400 }
                );
            }
        }

        // 4. Atomic Transaction execution via RPC or fallback
        let rpcExecuted = false;
        try {
            const { data: rpcResult, error: rpcError } = await admin.rpc("update_role_permissions", {
                p_role_id: roleId,
                p_permission_ids: uniquePermissionIds,
            });

            if (!rpcError && rpcResult) {
                rpcExecuted = true;
                if (!rpcResult.success) {
                    const status = rpcResult.error_code === "ROLE_NOT_FOUND" ? 404 : 400;
                    return Response.json(
                        { success: false, message: rpcResult.message },
                        { status }
                    );
                }
            }
        } catch {
            // Silently fall back to manual atomic sync if RPC is not installed in the connected DB
        }

        if (!rpcExecuted) {
            // Manual sync fallback
            const { data: currentRps, error: fetchCurrentError } = await admin
                .from("role_permissions")
                .select("permission_id")
                .eq("role_id", roleId);

            if (fetchCurrentError) {
                return Response.json(
                    { success: false, message: "Failed to read existing role permissions." },
                    { status: 500 }
                );
            }

            const currentIds = new Set((currentRps || []).map((r) => r.permission_id));
            const toDelete = [...currentIds].filter((id) => !uniquePermissionIds.includes(id));
            const toInsert = uniquePermissionIds.filter((id) => !currentIds.has(id));

            if (toDelete.length > 0) {
                const { error: delError } = await admin
                    .from("role_permissions")
                    .delete()
                    .eq("role_id", roleId)
                    .in("permission_id", toDelete);

                if (delError) {
                    return Response.json(
                        { success: false, message: "Failed to remove outdated role permissions." },
                        { status: 500 }
                    );
                }
            }

            if (toInsert.length > 0) {
                const rows = toInsert.map((permId) => ({
                    role_id: roleId,
                    permission_id: permId,
                }));
                const { error: insError } = await admin
                    .from("role_permissions")
                    .insert(rows);

                if (insError) {
                    return Response.json(
                        { success: false, message: "Failed to assign new role permissions." },
                        { status: 500 }
                    );
                }
            }
        }

        // 5. Retrieve final assigned permissions
        const { data: updatedRps } = await admin
            .from("role_permissions")
            .select(`
                permission_id,
                permission:permissions (id, key, description, module, name)
            `)
            .eq("role_id", roleId);

        let finalPermissions = [];
        if (updatedRps) {
            finalPermissions = updatedRps
                .map((r) => r.permission)
                .filter(Boolean)
                .map((p) => ({
                    id: p.id,
                    code: p.key,
                    key: p.key,
                    name: p.name || derivePermissionName(p.key),
                    module: p.module || derivePermissionModule(p.key),
                    description: p.description || "",
                }));
        }

        return Response.json(
            {
                success: true,
                message: "Role permissions updated successfully",
                data: {
                    role: {
                        id: role.id,
                        name: role.name,
                        code: role.code || role.name.toUpperCase().replace(/\s+/g, "_"),
                    },
                    permissions: finalPermissions,
                },
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Something went wrong while updating role permissions." },
            { status: 500 }
        );
    }
}

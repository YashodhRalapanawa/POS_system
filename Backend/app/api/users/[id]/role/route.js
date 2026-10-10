import { requireAuthAndPermission } from "../../../../../lib/auth/authorize.js";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../../lib/supabase/admin.js";

export const dynamic = "force-dynamic";

/**
 * Validates roleId from request body.
 * Must be a positive integer.
 */
function parseRoleId(rawRoleId) {
    if (rawRoleId === undefined || rawRoleId === null || rawRoleId === "") {
        return { valid: false, error: "Missing roleId." };
    }
    const parsed = Number(rawRoleId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return { valid: false, error: "Invalid role ID. Role ID must be a positive integer." };
    }
    return { valid: true, roleId: parsed };
}

/**
 * PATCH /api/users/[id]/role
 * Assigns or updates the role of a staff member.
 * Requires "users.assign_role" (or "users.manage") permission.
 */
export async function PATCH(request, context) {
    try {
        const auth = await requireAuthAndPermission(request, ["users.assign_role", "users.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const params = await context?.params;
        const targetUserId = params?.id;
        if (!targetUserId) {
            return Response.json(
                { success: false, message: "Staff member ID is required." },
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

        const { valid: isRoleValid, roleId, error: roleErrorMsg } = parseRoleId(body?.roleId);
        if (!isRoleValid) {
            return Response.json(
                { success: false, message: roleErrorMsg },
                { status: 400 }
            );
        }

        if (!isSupabaseAdminConfigured()) {
            return Response.json(
                { success: false, message: "Server database configuration is missing." },
                { status: 503 }
            );
        }

        const admin = getSupabaseAdmin();

        // 1. Verify staff member exists
        const { data: targetUser, error: userError } = await admin
            .from("users")
            .select(`
                id, full_name, email, username, employee_code, store_id, status, role_id,
                currentRole:roles (id, name, code)
            `)
            .eq("id", targetUserId)
            .maybeSingle();

        if (userError) {
            return Response.json(
                { success: false, message: "Failed to verify staff member." },
                { status: 500 }
            );
        }

        if (!targetUser) {
            return Response.json(
                { success: false, message: "Staff member not found." },
                { status: 404 }
            );
        }

        // 2. Verify new role exists and is active
        const { data: targetRole, error: targetRoleError } = await admin
            .from("roles")
            .select("id, name, code, is_system, is_active")
            .eq("id", roleId)
            .maybeSingle();

        if (targetRoleError) {
            return Response.json(
                { success: false, message: "Failed to verify target role." },
                { status: 500 }
            );
        }

        if (!targetRole) {
            return Response.json(
                { success: false, message: "Role not found." },
                { status: 404 }
            );
        }

        if (targetRole.is_active === false) {
            return Response.json(
                { success: false, message: "Cannot assign an inactive role." },
                { status: 400 }
            );
        }

        // 3. System Self-Protection: Prevent demoting the last active Administrator
        const currentRoleName = targetUser.currentRole?.name || "";
        const currentRoleCode = targetUser.currentRole?.code || "";
        const isCurrentlyAdmin =
            currentRoleName.toLowerCase() === "admin" ||
            currentRoleCode.toUpperCase() === "ADMIN";

        const newRoleName = targetRole.name || "";
        const newRoleCode = targetRole.code || "";
        const isNewRoleAdmin =
            newRoleName.toLowerCase() === "admin" ||
            newRoleCode.toUpperCase() === "ADMIN";

        if (isCurrentlyAdmin && !isNewRoleAdmin) {
            // Count remaining active administrators in the system
            const { data: adminRoles } = await admin
                .from("roles")
                .select("id")
                .or("name.eq.Admin,code.eq.ADMIN");

            const adminRoleIds = (adminRoles || []).map((r) => r.id);

            const { count: activeAdminCount, error: countError } = await admin
                .from("users")
                .select("id", { count: "exact", head: true })
                .in("role_id", adminRoleIds)
                .eq("status", "Active");

            if (!countError && activeAdminCount !== null && activeAdminCount <= 1) {
                return Response.json(
                    {
                        success: false,
                        message: "Cannot demote the last remaining active Administrator in the system.",
                    },
                    { status: 400 }
                );
            }
        }

        // 4. Atomic execution via RPC (with direct update fallback)
        let rpcExecuted = false;
        try {
            const { data: rpcResult, error: rpcError } = await admin.rpc("update_staff_role", {
                p_user_id: targetUserId,
                p_role_id: roleId,
            });

            if (!rpcError && rpcResult) {
                rpcExecuted = true;
                if (!rpcResult.success) {
                    const status = rpcResult.error_code === "USER_NOT_FOUND" || rpcResult.error_code === "ROLE_NOT_FOUND" ? 404 : 400;
                    return Response.json(
                        { success: false, message: rpcResult.message },
                        { status }
                    );
                }
            }
        } catch {
            // Silently fall back to direct update if RPC is not installed yet
        }

        if (!rpcExecuted) {
            const { error: updateError } = await admin
                .from("users")
                .update({
                    role_id: roleId,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", targetUserId);

            if (updateError) {
                return Response.json(
                    { success: false, message: "Failed to update staff role." },
                    { status: 500 }
                );
            }
        }

        // 5. Optional Activity Audit Log
        try {
            await admin.from("activity_logs").insert({
                store_id: targetUser.store_id,
                user_id: auth.user.id,
                entity_type: "user",
                entity_id: targetUserId,
                action: "Role updated",
                description: `Role changed to ${targetRole.name}`,
            });
        } catch {
            // Audit log error does not block success
        }

        // 6. Return structured response
        return Response.json(
            {
                success: true,
                message: "Staff role updated successfully",
                data: {
                    user: {
                        id: targetUser.id,
                        fullName: targetUser.full_name,
                        email: targetUser.email,
                        employeeCode: targetUser.employee_code,
                        role: {
                            id: targetRole.id,
                            name: targetRole.name,
                            code: targetRole.code || targetRole.name.toUpperCase().replace(/\s+/g, "_"),
                        },
                    },
                },
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Something went wrong while updating staff role." },
            { status: 500 }
        );
    }
}

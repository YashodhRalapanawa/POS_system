import { requireAuthAndPermission } from "../../../../../lib/auth/authorize.js";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../../lib/supabase/admin.js";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/users/[id]/status
 * Activates or deactivates a staff member.
 *
 * Requirements:
 *  - Authentication required
 *  - users.update (or users.manage fallback) permission required
 *  - Validates staff exists
 *  - Enforces Administrator protection: Cannot deactivate the last remaining active Administrator
 *  - Inactivates Supabase Auth sessions on deactivation
 *  - Preserves user account and historical records
 */
export async function PATCH(request, context) {
    try {
        const auth = await requireAuthAndPermission(request, ["users.update", "users.manage"]);
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

        // Determine requested target status
        let targetStatus;
        if (typeof body.isActive === "boolean") {
            targetStatus = body.isActive ? "Active" : "Inactive";
        } else if (typeof body.status === "string") {
            const s = body.status.trim();
            if (s.toLowerCase() === "active") targetStatus = "Active";
            else if (s.toLowerCase() === "inactive") targetStatus = "Inactive";
        }

        if (!targetStatus) {
            return Response.json(
                {
                    success: false,
                    message: "Invalid status parameter. Provide isActive: boolean or status: 'Active' | 'Inactive'.",
                },
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

        // 1. Fetch current staff member profile
        const { data: currentStaff, error: fetchErr } = await admin
            .from("users")
            .select(`
                id, full_name, email, username, employee_code, phone, avatar_url, status,
                all_registers, role_id, store_id, business_id,
                role:roles (id, name, code)
            `)
            .eq("id", targetUserId)
            .maybeSingle();

        if (fetchErr) {
            return Response.json(
                { success: false, message: "Failed to query staff member." },
                { status: 500 }
            );
        }

        if (!currentStaff) {
            return Response.json(
                { success: false, message: "Staff member not found." },
                { status: 404 }
            );
        }

        // 2. Administrator Protection: Cannot deactivate the last remaining active Administrator
        const isDeactivating = targetStatus === "Inactive";
        const currentRoleName = currentStaff.role?.name || "";
        const currentRoleCode = currentStaff.role?.code || "";
        const isCurrentlyAdmin = currentRoleName === "Admin" || currentRoleCode === "ADMIN";

        if (isDeactivating && isCurrentlyAdmin) {
            const { data: adminRoles } = await admin
                .from("roles")
                .select("id")
                .or("name.eq.Admin,code.eq.ADMIN");

            const adminRoleIds = (adminRoles || []).map((r) => r.id);

            const { count: activeAdminCount } = await admin
                .from("users")
                .select("id", { count: "exact", head: true })
                .in("role_id", adminRoleIds)
                .eq("status", "Active");

            if ((activeAdminCount || 0) <= 1) {
                return Response.json(
                    {
                        success: false,
                        message: "Cannot deactivate the last remaining active Administrator.",
                    },
                    { status: 400 }
                );
            }
        }

        // 3. Update status in database
        const { data: updatedStaff, error: updateErr } = await admin
            .from("users")
            .update({
                status: targetStatus,
                updated_at: new Date().toISOString(),
            })
            .eq("id", targetUserId)
            .select(`
                id, full_name, email, username, employee_code, phone, avatar_url, status,
                all_registers, last_login, created_at, role_id, store_id,
                role:roles (id, name, code),
                store:stores (id, name, code)
            `)
            .maybeSingle();

        if (updateErr) {
            return Response.json(
                { success: false, message: `Failed to update status: ${updateErr.message}` },
                { status: 500 }
            );
        }

        // 4. If deactivating, invalidate existing sessions via Supabase Auth admin
        if (isDeactivating) {
            try {
                if (admin.auth?.admin?.signOut) {
                    await admin.auth.admin.signOut(targetUserId, "global");
                }
            } catch (authSignOutErr) {
                // Non-blocking warning: Database status is authoritative and blocks subsequent requests
                console.warn("Session signout warning:", authSignOutErr?.message || authSignOutErr);
            }
        }

        // 5. Format response user object
        const roleObj = {
            id: updatedStaff.role?.id ?? updatedStaff.role_id,
            name: updatedStaff.role?.name || "Staff",
            code: updatedStaff.role?.code || "STAFF",
        };

        const storeObj = updatedStaff.store
            ? {
                  id: updatedStaff.store.id,
                  name: updatedStaff.store.name,
                  code: updatedStaff.store.code || null,
              }
            : null;

        const formatted = {
            id: updatedStaff.id,
            fullName: updatedStaff.full_name,
            name: updatedStaff.full_name,
            email: updatedStaff.email,
            username: updatedStaff.username || null,
            employeeCode: updatedStaff.employee_code || "—",
            employeeId: updatedStaff.employee_code || "—",
            role: roleObj,
            roleName: roleObj.name,
            roleCode: roleObj.code,
            roleId: roleObj.id,
            store: storeObj,
            storeId: storeObj?.id || updatedStaff.store_id,
            storeName: storeObj?.name || null,
            registerAccess: updatedStaff.all_registers ? "All Registers" : "None",
            allRegisters: Boolean(updatedStaff.all_registers),
            status: updatedStaff.status,
            isActive: updatedStaff.status === "Active",
            phone: updatedStaff.phone || null,
            avatarUrl: updatedStaff.avatar_url || null,
            lastLogin: updatedStaff.last_login || null,
            createdAt: updatedStaff.created_at || null,
        };

        return Response.json(
            {
                success: true,
                message: `Staff member ${targetStatus === "Active" ? "activated" : "deactivated"} successfully.`,
                data: {
                    user: formatted,
                },
                user: formatted,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Something went wrong while updating staff status." },
            { status: 500 }
        );
    }
}

import { requireAuthAndPermission, hasPermission, normalizeRole } from "../../../../lib/auth/authorize.js";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/users/[id]
 * Updates staff member profile, role, store assignment, or status.
 * Requirements:
 *  - Authentication required
 *  - users.update (or users.manage fallback) permission required
 *  - users.assign_role required if changing role
 *  - Validates staff exists
 *  - Last active Administrator protection enforced
 *  - Preserves unchanged fields
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

        const updates = {
            updated_at: new Date().toISOString(),
        };

        // 2. Validate and handle Full Name
        if (body.fullName !== undefined || body.name !== undefined) {
            const newName = String(body.fullName ?? body.name ?? "").trim();
            if (!newName) {
                return Response.json(
                    { success: false, message: "Full name cannot be empty." },
                    { status: 400 }
                );
            }
            updates.full_name = newName;
        }

        // 3. Validate and handle Email
        if (body.email !== undefined) {
            const newEmail = String(body.email).trim().toLowerCase();
            if (!newEmail || !/^\S+@\S+\.\S+$/.test(newEmail)) {
                return Response.json(
                    { success: false, message: "A valid email address is required." },
                    { status: 400 }
                );
            }

            if (newEmail !== currentStaff.email.toLowerCase()) {
                // Check if email already used by another user
                const { data: existingUser } = await admin
                    .from("users")
                    .select("id")
                    .ilike("email", newEmail)
                    .neq("id", targetUserId)
                    .maybeSingle();

                if (existingUser) {
                    return Response.json(
                        { success: false, message: "Email is already in use by another account." },
                        { status: 409 }
                    );
                }

                // Update email in Supabase Auth
                try {
                    const { error: authUpdateErr } = await admin.auth.admin.updateUserById(targetUserId, {
                        email: newEmail,
                    });
                    if (authUpdateErr) {
                        return Response.json(
                            { success: false, message: `Failed to update auth email: ${authUpdateErr.message}` },
                            { status: 400 }
                        );
                    }
                } catch (authErr) {
                    return Response.json(
                        { success: false, message: `Auth service error: ${authErr.message}` },
                        { status: 500 }
                    );
                }

                updates.email = newEmail;
            }
        }

        // 4. Validate and handle Role Update
        const rawRoleId = body.roleId;
        const rawRole = body.role;
        if (rawRoleId !== undefined || rawRole !== undefined) {
            // Require users.assign_role (or users.manage) permission
            const canAssignRole = hasPermission(auth.user, ["users.assign_role", "users.manage"]);
            if (!canAssignRole) {
                return Response.json(
                    { success: false, message: "Forbidden: users.assign_role permission required to change role." },
                    { status: 403 }
                );
            }

            // Resolve target role
            let roleQuery = admin.from("roles").select("id, name, code, is_active");
            const parsedRoleId = Number(rawRoleId);

            if (Number.isInteger(parsedRoleId) && parsedRoleId > 0) {
                roleQuery = roleQuery.eq("id", parsedRoleId);
            } else if (typeof rawRoleId === "string" && rawRoleId.trim()) {
                roleQuery = roleQuery.or(`id.eq.${rawRoleId},code.ilike.${rawRoleId.toUpperCase()},name.ilike.${rawRoleId}`);
            } else if (rawRole) {
                const roleName = String(rawRole).trim();
                roleQuery = roleQuery.or(`name.ilike.${roleName},code.ilike.${roleName.toUpperCase()}`);
            }

            const { data: newRoleRow, error: roleErr } = await roleQuery.maybeSingle();

            if (roleErr || !newRoleRow) {
                return Response.json(
                    { success: false, message: "Invalid role selected." },
                    { status: 400 }
                );
            }

            if (newRoleRow.is_active === false) {
                return Response.json(
                    { success: false, message: "Cannot assign an inactive role." },
                    { status: 400 }
                );
            }

            // Step 5: Administrator Protection
            const currentRoleName = currentStaff.role?.name || "";
            const currentRoleCode = currentStaff.role?.code || "";
            const isCurrentlyAdmin = currentRoleName === "Admin" || currentRoleCode === "ADMIN";
            const willBeAdmin = newRoleRow.name === "Admin" || newRoleRow.code === "ADMIN";

            if (isCurrentlyAdmin && !willBeAdmin) {
                // Check remaining active administrators
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
                        { success: false, message: "Cannot demote the last remaining active Administrator." },
                        { status: 400 }
                    );
                }
            }

            // Privilege escalation protection: only Admins can assign Admin role
            if (willBeAdmin && normalizeRole(auth.user.role) !== "ADMIN") {
                return Response.json(
                    { success: false, message: "Insufficient privileges to assign Administrator role." },
                    { status: 403 }
                );
            }

            updates.role_id = newRoleRow.id;
        }

        // 5. Validate and handle Store Assignment
        const rawStoreId = body.storeId || (Array.isArray(body.storeIds) && body.storeIds[0]);
        if (rawStoreId !== undefined) {
            const { data: storeRow, error: storeErr } = await admin
                .from("stores")
                .select("id, is_active")
                .eq("id", rawStoreId)
                .maybeSingle();

            if (storeErr || !storeRow) {
                return Response.json(
                    { success: false, message: "Selected store does not exist." },
                    { status: 400 }
                );
            }

            updates.store_id = storeRow.id;
        }

        // 6. Validate and handle Employee Code
        if (body.employeeCode !== undefined || body.employeeId !== undefined) {
            const newCode = String(body.employeeCode ?? body.employeeId ?? "").trim();
            if (newCode && newCode !== currentStaff.employee_code) {
                const targetStore = updates.store_id || currentStaff.store_id;
                const { data: existingCode } = await admin
                    .from("users")
                    .select("id")
                    .eq("store_id", targetStore)
                    .eq("employee_code", newCode)
                    .neq("id", targetUserId)
                    .maybeSingle();

                if (existingCode) {
                    return Response.json(
                        { success: false, message: "Employee ID already in use in this store." },
                        { status: 409 }
                    );
                }
                updates.employee_code = newCode;
            }
        }

        // 7. Register Access & Status fields
        if (body.allRegisters !== undefined) {
            updates.all_registers = Boolean(body.allRegisters);
        } else if (body.registerAccess !== undefined) {
            updates.all_registers = body.registerAccess === "All Registers";
        }

        if (typeof body.isActive === "boolean") {
            updates.status = body.isActive ? "Active" : "Inactive";
        } else if (body.status !== undefined && ["Active", "Inactive", "Locked"].includes(body.status)) {
            updates.status = body.status;
        }

        if (updates.status === "Inactive" && currentStaff.status !== "Inactive") {
            const currentRoleName = currentStaff.role?.name || "";
            const currentRoleCode = currentStaff.role?.code || "";
            const isCurrentlyAdmin = currentRoleName === "Admin" || currentRoleCode === "ADMIN";
            if (isCurrentlyAdmin) {
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
                        { success: false, message: "Cannot deactivate the last remaining active Administrator." },
                        { status: 400 }
                    );
                }
            }
        }

        // 8. Execute update in public.users
        const { data: updatedStaff, error: updateErr } = await admin
            .from("users")
            .update(updates)
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
                { success: false, message: `Failed to update staff profile: ${updateErr.message}` },
                { status: 500 }
            );
        }

        if (updates.status === "Inactive") {
            try {
                if (admin.auth?.admin?.signOut) {
                    await admin.auth.admin.signOut(targetUserId, "global");
                }
            } catch (authSignOutErr) {
                console.warn("Session signout warning:", authSignOutErr?.message || authSignOutErr);
            }
        }

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
            status: updatedStaff.status || "Active",
            isActive: updatedStaff.status === "Active",
            phone: updatedStaff.phone || null,
            avatarUrl: updatedStaff.avatar_url || null,
            lastLogin: updatedStaff.last_login || null,
            createdAt: updatedStaff.created_at || null,
        };

        return Response.json(
            {
                success: true,
                message: "Staff member updated successfully",
                data: {
                    user: formatted,
                },
                user: formatted,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Something went wrong while updating staff member." },
            { status: 500 }
        );
    }
}

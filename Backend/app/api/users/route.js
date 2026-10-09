import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";
import { extractBearerToken, verifyUserToken, createUserClient } from "../../../lib/supabase/server.js";
import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/users
 * Retrieves staff members list.
 * Requirements:
 *  - Supabase authentication required
 *  - users.view permission required (with users.manage fallback)
 *  - Dynamic role information (id, name, code)
 *  - Store assignment information where available
 *  - Sensitive secrets (passwords) excluded
 *  - Search, pagination, status filtering supported
 */
export async function GET(request) {
    try {
        // Enforce permission: users.view (or users.manage fallback)
        const auth = await requireAuthAndPermission(request, ["users.view", "users.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const url = new URL(request.url);
        const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
        const statusFilter = (url.searchParams.get("status") || "").trim();
        const roleFilter = (url.searchParams.get("role") || "").trim();
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
        const offset = (page - 1) * limit;

        // Use user-scoped client, or admin if configured for store/business-wide staff
        const db = isSupabaseAdminConfigured() ? getSupabaseAdmin() : auth.client;

        let query = db
            .from("users")
            .select(`
                id, full_name, email, username, employee_code, phone, avatar_url, status,
                all_registers, last_login, created_at, role_id, store_id,
                role:roles (id, name, code),
                store:stores (id, name, code)
            `, { count: "exact" });

        if (statusFilter && statusFilter !== "All Status") {
            query = query.eq("status", statusFilter);
        }

        if (roleFilter && roleFilter !== "All Roles") {
            const roleIdNum = Number(roleFilter);
            if (Number.isInteger(roleIdNum) && roleIdNum > 0) {
                query = query.eq("role_id", roleIdNum);
            }
        }

        if (search) {
            const cleanSearch = search.replace(/[%_,]/g, "");
            if (cleanSearch) {
                query = query.or(`full_name.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%,employee_code.ilike.%${cleanSearch}%,username.ilike.%${cleanSearch}%`);
            }
        }

        query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

        const { data: users, count, error } = await query;

        if (error) {
            // Fallback if joined table columns are missing in older schema
            const { data: fallbackUsers, count: fallbackCount, error: fallbackError } = await db
                .from("users")
                .select(`
                    id, full_name, email, username, employee_code, phone, avatar_url, status,
                    all_registers, last_login, created_at, role_id, store_id,
                    role:roles (id, name)
                `, { count: "exact" })
                .order("created_at", { ascending: false })
                .range(offset, offset + limit - 1);

            if (fallbackError) {
                return Response.json(
                    { success: false, message: "Failed to retrieve staff records." },
                    { status: 500 }
                );
            }

            const formattedFallback = (fallbackUsers || []).map((u) => {
                const roleObj = {
                    id: u.role?.id ?? u.role_id,
                    name: u.role?.name || "Staff",
                    code: u.role?.name ? u.role.name.toUpperCase().replace(/\s+/g, "_") : "STAFF",
                };

                return {
                    id: u.id,
                    fullName: u.full_name,
                    name: u.full_name,
                    email: u.email,
                    username: u.username || null,
                    employeeCode: u.employee_code || "—",
                    employeeId: u.employee_code || "—",
                    role: roleObj,
                    roleName: roleObj.name,
                    roleCode: roleObj.code,
                    roleId: roleObj.id,
                    store: null,
                    storeName: null,
                    registerAccess: u.all_registers ? "All Registers" : "None",
                    allRegisters: Boolean(u.all_registers),
                    status: u.status || "Active",
                    isActive: u.status === "Active",
                    phone: u.phone || null,
                    avatarUrl: u.avatar_url || null,
                    lastLogin: u.last_login || null,
                    createdAt: u.created_at || null,
                };
            });

            return Response.json(
                {
                    success: true,
                    message: "Staff retrieved successfully",
                    data: {
                        users: formattedFallback,
                        total: fallbackCount ?? formattedFallback.length,
                        page,
                        limit,
                    },
                    users: formattedFallback,
                },
                { status: 200 }
            );
        }

        const formatted = (users || []).map((u) => {
            const roleObj = {
                id: u.role?.id ?? u.role_id,
                name: u.role?.name || "Staff",
                code: u.role?.code || (u.role?.name ? u.role.name.toUpperCase().replace(/\s+/g, "_") : "STAFF"),
            };

            const storeObj = u.store
                ? {
                      id: u.store.id,
                      name: u.store.name,
                      code: u.store.code || null,
                  }
                : null;

            return {
                id: u.id,
                fullName: u.full_name,
                name: u.full_name,
                email: u.email,
                username: u.username || null,
                employeeCode: u.employee_code || "—",
                employeeId: u.employee_code || "—",
                role: roleObj,
                roleName: roleObj.name,
                roleCode: roleObj.code,
                roleId: roleObj.id,
                store: storeObj,
                storeId: storeObj?.id || u.store_id || null,
                storeName: storeObj?.name || null,
                registerAccess: u.all_registers ? "All Registers" : "None",
                allRegisters: Boolean(u.all_registers),
                status: u.status || "Active",
                isActive: u.status === "Active",
                phone: u.phone || null,
                avatarUrl: u.avatar_url || null,
                lastLogin: u.last_login || null,
                createdAt: u.created_at || null,
            };
        });

        return Response.json(
            {
                success: true,
                message: "Staff retrieved successfully",
                data: {
                    users: formatted,
                    total: count ?? formatted.length,
                    page,
                    limit,
                },
                users: formatted,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Something went wrong while retrieving users." },
            { status: 500 }
        );
    }
}

/**
 * POST /api/users
 * Creates a new staff member and provisions their Supabase Auth account.
 * Requirements:
 *  - Supabase authentication required
 *  - users.create (or users.manage fallback) permission required
 *  - Validates fullName, email format, unique email, roleId, storeId
 *  - Provisions Supabase Auth account via invitation (or createUser fallback)
 *  - Links profile in public.users with assigned dynamic role and store
 *  - Cleans up / deletes created auth user if profile insert fails (no orphaned accounts)
 *  - Returns HTTP 201 with newly created staff record
 */
export async function POST(request) {
    try {
        // Step 2 & 10: Enforce authentication and permission: users.create (or users.manage fallback)
        const auth = await requireAuthAndPermission(request, ["users.create", "users.manage"]);
        if (!auth.authorized) {
            return auth.response;
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

        const name = String(body?.fullName || body?.name || "").trim();
        const email = String(body?.email || "").trim().toLowerCase();
        const employeeId = String(body?.employeeCode || body?.employeeId || "").trim();
        const rawRoleId = body?.roleId;
        const rawRole = body?.role;
        const rawStoreId = body?.storeId || (Array.isArray(body?.storeIds) && body?.storeIds[0]) || null;
        const registerAccess = String(body?.registerAccess || "Register #01").trim();
        const allRegisters = Boolean(body?.allRegisters || registerAccess === "All Registers");
        const status = body?.status === "Inactive" ? "Inactive" : "Active";

        // Step 11: Validation
        if (!name) {
            return Response.json(
                { success: false, message: "Full name is required." },
                { status: 400 }
            );
        }

        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            return Response.json(
                { success: false, message: "A valid email address is required." },
                { status: 400 }
            );
        }

        if (!rawRoleId && !rawRole) {
            return Response.json(
                { success: false, message: "Role selection is required." },
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

        // 1. Check duplicate email in public.users
        const { data: existingUser } = await admin
            .from("users")
            .select("id, email")
            .ilike("email", email)
            .maybeSingle();

        if (existingUser) {
            return Response.json(
                { success: false, message: "A staff account with this email already exists." },
                { status: 409 }
            );
        }

        // 2. Validate selected role from public.roles
        let roleQuery = admin.from("roles").select("id, name, code, is_active");
        const roleIdNum = Number(rawRoleId);

        if (Number.isInteger(roleIdNum) && roleIdNum > 0) {
            roleQuery = roleQuery.eq("id", roleIdNum);
        } else if (typeof rawRoleId === "string" && rawRoleId.trim()) {
            roleQuery = roleQuery.or(`id.eq.${rawRoleId},code.ilike.${rawRoleId.toUpperCase()},name.ilike.${rawRoleId}`);
        } else if (rawRole) {
            const roleName = String(rawRole).trim();
            roleQuery = roleQuery.or(`name.ilike.${roleName},code.ilike.${roleName.toUpperCase()}`);
        }

        const { data: roleRow, error: roleErr } = await roleQuery.maybeSingle();

        if (roleErr || !roleRow) {
            return Response.json(
                { success: false, message: "Invalid role selected." },
                { status: 400 }
            );
        }

        if (roleRow.is_active === false) {
            return Response.json(
                { success: false, message: "Cannot assign an inactive role." },
                { status: 400 }
            );
        }

        // 3. Resolve and validate target store and business
        let targetStoreId = rawStoreId;
        let businessId = null;

        if (targetStoreId) {
            const { data: storeRow, error: storeErr } = await admin
                .from("stores")
                .select("id, business_id, name, code, is_active")
                .eq("id", targetStoreId)
                .maybeSingle();

            if (storeErr || !storeRow) {
                return Response.json(
                    { success: false, message: "Selected store does not exist." },
                    { status: 400 }
                );
            }
            businessId = storeRow.business_id;
        } else {
            // Default to authenticated user's store or the first available store
            let storeQuery = admin.from("stores").select("id, business_id, name, code");
            if (auth.user?.storeId) {
                storeQuery = storeQuery.eq("id", auth.user.storeId);
            }
            const { data: defaultStore } = await storeQuery.limit(1).maybeSingle();

            if (!defaultStore) {
                return Response.json(
                    { success: false, message: "No active store found to assign staff." },
                    { status: 400 }
                );
            }
            targetStoreId = defaultStore.id;
            businessId = defaultStore.business_id;
        }

        // 4. Employee code validation or automatic generation
        let finalEmployeeCode = employeeId;
        if (finalEmployeeCode) {
            const { data: existingCode } = await admin
                .from("users")
                .select("id")
                .eq("store_id", targetStoreId)
                .eq("employee_code", finalEmployeeCode)
                .maybeSingle();

            if (existingCode) {
                return Response.json(
                    { success: false, message: "Employee ID already exists in this store." },
                    { status: 409 }
                );
            }
        } else {
            // Auto-generate employee code
            const { count: userCount } = await admin
                .from("users")
                .select("id", { count: "exact", head: true });
            finalEmployeeCode = `EMP-${String((userCount || 0) + 1).padStart(3, "0")}`;
        }

        // Step 4: Supabase Auth Account Creation (Invitation Workflow)
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:5173";
        const redirectTo = `${appUrl}/reset-password`;

        let authUserId = null;

        try {
            const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
                data: {
                    full_name: name,
                },
                redirectTo,
            });

            if (inviteData?.user?.id) {
                authUserId = inviteData.user.id;
            } else if (inviteErr) {
                const errMsg = (inviteErr.message || "").toLowerCase();
                if (errMsg.includes("already registered") || errMsg.includes("user already exists") || inviteErr.status === 422) {
                    return Response.json(
                        { success: false, message: "A user with this email already exists in authentication." },
                        { status: 409 }
                    );
                }

                // Fallback to createUser (if email invitation service is not enabled in environment)
                const { data: createData, error: createErr } = await admin.auth.admin.createUser({
                    email,
                    email_confirm: true,
                    user_metadata: {
                        full_name: name,
                    },
                });

                if (createErr) {
                    const createErrMsg = (createErr.message || "").toLowerCase();
                    if (createErrMsg.includes("already registered") || createErrMsg.includes("user already exists") || createErr.status === 422) {
                        return Response.json(
                            { success: false, message: "A user with this email already exists in authentication." },
                            { status: 409 }
                        );
                    }
                    return Response.json(
                        { success: false, message: `Failed to create authentication account: ${createErr.message}` },
                        { status: 500 }
                    );
                }

                authUserId = createData?.user?.id;
            }
        } catch (authError) {
            return Response.json(
                { success: false, message: `Authentication service error: ${authError.message}` },
                { status: 500 }
            );
        }

        if (!authUserId) {
            return Response.json(
                { success: false, message: "Failed to obtain authentication user ID." },
                { status: 500 }
            );
        }

        // Step 4: Create staff profile in public.users
        const { data: createdProfile, error: profileInsertError } = await admin
            .from("users")
            .insert({
                id: authUserId,
                business_id: businessId,
                store_id: targetStoreId,
                role_id: roleRow.id,
                full_name: name,
                email,
                employee_code: finalEmployeeCode,
                status,
                all_registers: allRegisters,
            })
            .select(`
                id, full_name, email, username, employee_code, phone, avatar_url, status,
                all_registers, last_login, created_at, role_id, store_id,
                role:roles (id, name, code),
                store:stores (id, name, code)
            `)
            .maybeSingle();

        // Rollback / cleanup if profile insertion fails (no orphaned auth accounts)
        if (profileInsertError) {
            try {
                await admin.auth.admin.deleteUser(authUserId);
            } catch {
                // Ignore cleanup errors
            }

            return Response.json(
                { success: false, message: `Failed to create staff profile: ${profileInsertError.message}` },
                { status: 500 }
            );
        }

        const roleObj = {
            id: createdProfile.role?.id ?? roleRow.id,
            name: createdProfile.role?.name || roleRow.name,
            code: createdProfile.role?.code || roleRow.code || "STAFF",
        };

        const storeObj = createdProfile.store
            ? {
                  id: createdProfile.store.id,
                  name: createdProfile.store.name,
                  code: createdProfile.store.code || null,
              }
            : null;

        const formatted = {
            id: createdProfile.id,
            fullName: createdProfile.full_name,
            name: createdProfile.full_name,
            email: createdProfile.email,
            username: createdProfile.username || null,
            employeeCode: createdProfile.employee_code || "—",
            employeeId: createdProfile.employee_code || "—",
            role: roleObj,
            roleName: roleObj.name,
            roleCode: roleObj.code,
            roleId: roleObj.id,
            store: storeObj,
            storeId: storeObj?.id || targetStoreId,
            storeName: storeObj?.name || null,
            registerAccess: createdProfile.all_registers ? "All Registers" : registerAccess,
            allRegisters: Boolean(createdProfile.all_registers),
            status: createdProfile.status || "Active",
            isActive: createdProfile.status === "Active",
            phone: createdProfile.phone || null,
            avatarUrl: createdProfile.avatar_url || null,
            lastLogin: createdProfile.last_login || null,
            createdAt: createdProfile.created_at || null,
        };

        return Response.json(
            {
                success: true,
                message: "Staff member created successfully",
                data: {
                    user: formatted,
                },
                user: formatted,
            },
            { status: 201 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Something went wrong while creating staff member." },
            { status: 500 }
        );
    }
}


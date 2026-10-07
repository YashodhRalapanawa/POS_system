import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/roles
 * Retrieves active roles for staff assignment and dropdowns.
 * Requires "roles.view" permission.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, "roles.view");
        if (!auth.authorized) {
            return auth.response;
        }

        // Query roles table
        let list = [];
        const { data: roles, error } = await auth.client
            .from("roles")
            .select("id, name, description, created_at, code, is_system, is_active")
            .order("id", { ascending: true });

        if (error) {
            // Fallback for environments where migration columns are not yet added
            const { data: fallbackRoles, error: fallbackError } = await auth.client
                .from("roles")
                .select("id, name, description, created_at")
                .order("id", { ascending: true });

            if (fallbackError) {
                return Response.json(
                    { success: false, message: "Failed to retrieve roles." },
                    { status: 500 }
                );
            }
            list = fallbackRoles || [];
        } else {
            list = roles || [];
        }

        const formattedRoles = list.map((r) => ({
            id: r.id,
            name: r.name,
            code: r.code || r.name.toUpperCase().replace(/\s+/g, "_"),
            description: r.description || "",
            isSystem: r.is_system ?? (["Admin", "Manager", "Cashier"].includes(r.name)),
            isActive: r.is_active ?? true,
            createdAt: r.created_at,
        }));

        const activeRoles = formattedRoles.filter((r) => r.isActive !== false);

        return Response.json(
            {
                success: true,
                message: "Roles retrieved successfully",
                data: {
                    roles: activeRoles,
                },
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Something went wrong while retrieving roles." },
            { status: 500 }
        );
    }
}

/**
 * POST /api/roles
 * Creates a new business role without permissions (permissions assigned separately).
 * Requires "roles.create" permission.
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, "roles.create");
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

        const name = String(body?.name || "").trim();
        const rawCode = String(body?.code || "").trim();
        const description = String(body?.description || "").trim();

        // Step 8: Validate required fields
        if (!name) {
            return Response.json(
                { success: false, message: "Role name is required." },
                { status: 400 }
            );
        }

        if (!rawCode) {
            return Response.json(
                { success: false, message: "Role code is required." },
                { status: 400 }
            );
        }

        // Code normalization: e.g. "SUPERVISOR", "STORE_KEEPER"
        const code = rawCode.toUpperCase().replace(/\s+/g, "_");
        if (!/^[A-Z0-9_]{2,30}$/.test(code)) {
            return Response.json(
                {
                    success: false,
                    message: "Role code must be 2-30 characters containing only uppercase letters, numbers, and underscores (e.g. SUPERVISOR).",
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

        // Duplicate check
        const { data: existingRoles, error: checkError } = await admin
            .from("roles")
            .select("id, name, code");

        if (checkError) {
            return Response.json(
                { success: false, message: "Failed to verify existing roles." },
                { status: 500 }
            );
        }

        const duplicateName = (existingRoles || []).some(
            (r) => r.name.toLowerCase() === name.toLowerCase()
        );
        if (duplicateName) {
            return Response.json(
                { success: false, message: "A role with this name already exists." },
                { status: 409 }
            );
        }

        const duplicateCode = (existingRoles || []).some(
            (r) => (r.code && r.code.toUpperCase() === code) || r.name.toUpperCase().replace(/\s+/g, "_") === code
        );
        if (duplicateCode) {
            return Response.json(
                { success: false, message: "A role with this code already exists." },
                { status: 409 }
            );
        }

        // Insert new role
        let createdRole;
        const insertPayload = {
            name,
            code,
            description,
            is_system: false,
            is_active: true,
        };

        const { data: inserted, error: insertError } = await admin
            .from("roles")
            .insert(insertPayload)
            .select()
            .single();

        if (insertError) {
            // Graceful fallback if new migration columns are not yet in the DB
            if (insertError.message?.includes("code") || insertError.code === "PGRST204") {
                const { data: fallbackInsert, error: fallbackError } = await admin
                    .from("roles")
                    .insert({ name, description })
                    .select()
                    .single();

                if (fallbackError) {
                    throw fallbackError;
                }
                createdRole = fallbackInsert;
            } else {
                throw insertError;
            }
        } else {
            createdRole = inserted;
        }

        return Response.json(
            {
                success: true,
                message: "Role created successfully",
                data: {
                    role: {
                        id: createdRole.id,
                        name: createdRole.name,
                        code: createdRole.code || code,
                        description: createdRole.description || description,
                        isSystem: createdRole.is_system ?? false,
                        isActive: createdRole.is_active ?? true,
                        createdAt: createdRole.created_at,
                    },
                },
            },
            { status: 201 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Something went wrong while creating the role." },
            { status: 500 }
        );
    }
}

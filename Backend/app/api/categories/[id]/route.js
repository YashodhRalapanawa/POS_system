import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/categories/[id]
 * Updates product category details or active/inactive status.
 *
 * Requirements:
 *  - Supabase authentication required
 *  - categories.update (or categories.manage fallback) permission required
 *  - Validates category exists
 *  - Updates Category Name, Code, Description, and Active Status
 *  - Prevents duplicate name/code within the same store
 *  - Preserves unchanged fields and existing product relationships
 *  - Returns updated category record
 */
export async function PATCH(request, context) {
    try {
        const auth = await requireAuthAndPermission(request, ["categories.update", "categories.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const params = await context?.params;
        const categoryId = params?.id;
        if (!categoryId) {
            return Response.json(
                { success: false, message: "Category ID is required." },
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

        // 1. Fetch current category record
        const { data: currentCategory, error: fetchErr } = await admin
            .from("categories")
            .select("id, store_id, name, code, description, status, created_at, updated_at")
            .eq("id", categoryId)
            .maybeSingle();

        if (fetchErr) {
            return Response.json(
                { success: false, message: `Failed to query category: ${fetchErr.message}` },
                { status: 500 }
            );
        }

        if (!currentCategory) {
            return Response.json(
                { success: false, message: "Category not found." },
                { status: 404 }
            );
        }

        const updates = {
            updated_at: new Date().toISOString(),
        };

        // 2. Validate and handle Category Name
        if (body.name !== undefined) {
            const newName = String(body.name).trim();
            if (!newName) {
                return Response.json(
                    { success: false, message: "Category name cannot be empty." },
                    { status: 400 }
                );
            }

            if (newName.toLowerCase() !== currentCategory.name.toLowerCase()) {
                const { data: duplicateName } = await admin
                    .from("categories")
                    .select("id")
                    .eq("store_id", currentCategory.store_id)
                    .ilike("name", newName)
                    .neq("id", categoryId)
                    .maybeSingle();

                if (duplicateName) {
                    return Response.json(
                        { success: false, message: `A category named "${newName}" already exists.` },
                        { status: 409 }
                    );
                }
            }

            updates.name = newName;
        }

        // 3. Validate and handle Category Code
        if (body.code !== undefined) {
            const rawCode = String(body.code || "").trim();
            const newCode = rawCode ? rawCode.toUpperCase() : null;

            if (newCode && newCode !== (currentCategory.code || "").toUpperCase()) {
                const { data: duplicateCode } = await admin
                    .from("categories")
                    .select("id")
                    .eq("store_id", currentCategory.store_id)
                    .ilike("code", newCode)
                    .neq("id", categoryId)
                    .maybeSingle();

                if (duplicateCode) {
                    return Response.json(
                        { success: false, message: `Category code "${newCode}" is already in use.` },
                        { status: 409 }
                    );
                }
            }

            updates.code = newCode;
        }

        // 4. Validate and handle Description
        if (body.description !== undefined) {
            updates.description = String(body.description || "").trim();
        }

        // 5. Validate and handle Active Status
        if (typeof body.isActive === "boolean") {
            updates.status = body.isActive ? "Active" : "Inactive";
        } else if (typeof body.status === "string") {
            const s = body.status.trim();
            if (["Active", "Inactive"].includes(s)) {
                updates.status = s;
            }
        }

        // 6. Execute update in Supabase
        const { data: updated, error: updateErr } = await admin
            .from("categories")
            .update(updates)
            .eq("id", categoryId)
            .select("id, store_id, name, code, description, status, created_at, updated_at")
            .maybeSingle();

        if (updateErr) {
            // Handle if code column error in legacy schema
            if (updateErr.message?.includes("code") && updates.code !== undefined) {
                delete updates.code;
                const { data: retryUpdated, error: retryErr } = await admin
                    .from("categories")
                    .update(updates)
                    .eq("id", categoryId)
                    .select("id, store_id, name, description, status, created_at, updated_at")
                    .maybeSingle();

                if (retryErr) {
                    return Response.json(
                        { success: false, message: `Failed to update category: ${retryErr.message}` },
                        { status: 500 }
                    );
                }

                // Query product count
                const { count: productCount } = await admin
                    .from("products")
                    .select("id", { count: "exact", head: true })
                    .eq("category_id", categoryId);

                const fallbackFormatted = {
                    id: retryUpdated.id,
                    name: retryUpdated.name,
                    code: null,
                    description: retryUpdated.description || "",
                    status: retryUpdated.status || "Active",
                    isActive: retryUpdated.status === "Active",
                    productCount: productCount || 0,
                    storeId: retryUpdated.store_id,
                    createdAt: retryUpdated.created_at,
                    updatedAt: retryUpdated.updated_at,
                };

                return Response.json(
                    {
                        success: true,
                        message: "Category updated successfully.",
                        data: { category: fallbackFormatted },
                        category: fallbackFormatted,
                    },
                    { status: 200 }
                );
            }

            return Response.json(
                { success: false, message: `Failed to update category: ${updateErr.message}` },
                { status: 500 }
            );
        }

        // Query product count
        const { count: productCount } = await admin
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("category_id", categoryId);

        const formatted = {
            id: updated.id,
            name: updated.name,
            code: updated.code || null,
            description: updated.description || "",
            status: updated.status || "Active",
            isActive: updated.status === "Active",
            productCount: productCount || 0,
            storeId: updated.store_id,
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
        };

        return Response.json(
            {
                success: true,
                message: "Category updated successfully.",
                data: {
                    category: formatted,
                },
                category: formatted,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Internal server error while updating category." },
            { status: 500 }
        );
    }
}

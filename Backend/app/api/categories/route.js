import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/categories
 * Retrieves product categories.
 *
 * Requirements:
 *  - Supabase authentication required
 *  - categories.view (or categories.manage fallback) permission required
 *  - Real category records from Supabase
 *  - Search by name or code
 *  - Active/inactive filtering
 *  - Consistent API response
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["categories.view", "categories.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const url = new URL(request.url);
        const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
        const statusFilter = (url.searchParams.get("status") || "").trim();
        const isAllRequested = url.searchParams.get("all") === "true";
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
        const limit = isAllRequested
            ? 500
            : Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
        const offset = (page - 1) * limit;

        if (!isSupabaseAdminConfigured()) {
            return Response.json(
                { success: false, message: "Server database configuration is missing." },
                { status: 503 }
            );
        }

        const admin = getSupabaseAdmin();

        // Query categories_with_counts view if available, or categories table
        let query = admin
            .from("categories_with_counts")
            .select("*", { count: "exact" });

        // Status filtering
        if (statusFilter && statusFilter !== "All Status" && statusFilter !== "All") {
            query = query.eq("status", statusFilter);
        }

        // Search filtering (name or code or description)
        if (search) {
            const cleanSearch = search.replace(/[%_,]/g, "");
            if (cleanSearch) {
                query = query.or(`name.ilike.%${cleanSearch}%,code.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%`);
            }
        }

        // Restrict to user's store if store_id exists
        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            query = query.eq("store_id", userStoreId);
        }

        query = query.order("name", { ascending: true }).range(offset, offset + limit - 1);

        let { data: categories, count, error } = await query;

        // If categories_with_counts view is not available or errored, fallback to categories table
        if (error) {
            let fallbackQuery = admin
                .from("categories")
                .select(`
                    id, store_id, name, description, status, created_at, updated_at,
                    products:products (count)
                `, { count: "exact" });

            if (statusFilter && statusFilter !== "All Status" && statusFilter !== "All") {
                fallbackQuery = fallbackQuery.eq("status", statusFilter);
            }

            if (search) {
                const cleanSearch = search.replace(/[%_,]/g, "");
                if (cleanSearch) {
                    fallbackQuery = fallbackQuery.or(`name.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%`);
                }
            }

            if (auth.user?.storeId || auth.user?.store_id) {
                const userStoreId = auth.user.storeId || auth.user.store_id;
                fallbackQuery = fallbackQuery.eq("store_id", userStoreId);
            }

            fallbackQuery = fallbackQuery.order("name", { ascending: true }).range(offset, offset + limit - 1);

            const fallbackRes = await fallbackQuery;
            if (fallbackRes.error) {
                return Response.json(
                    { success: false, message: `Failed to retrieve categories: ${fallbackRes.error.message}` },
                    { status: 500 }
                );
            }

            categories = (fallbackRes.data || []).map((c) => ({
                ...c,
                product_count: Array.isArray(c.products) && c.products[0] ? c.products[0].count : 0,
            }));
            count = fallbackRes.count;
        }

        const total = count ?? (categories?.length || 0);
        const totalPages = Math.ceil(total / limit) || 1;

        const formatted = (categories || []).map((c) => ({
            id: c.id,
            name: c.name,
            code: c.code || null,
            description: c.description || "",
            status: c.status || "Active",
            isActive: c.status === "Active",
            productCount: Number(c.product_count ?? c.products_count ?? 0),
            storeId: c.store_id,
            createdAt: c.created_at || null,
            updatedAt: c.updated_at || null,
        }));

        return Response.json(
            {
                success: true,
                message: "Categories retrieved successfully.",
                data: {
                    categories: formatted,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages,
                        hasNext: page < totalPages,
                        hasPrev: page > 1,
                    },
                },
                categories: formatted,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Internal server error while fetching categories." },
            { status: 500 }
        );
    }
}

/**
 * POST /api/categories
 * Creates a new product category in Supabase.
 *
 * Requirements:
 *  - Supabase authentication required
 *  - categories.create (or categories.manage fallback) permission required
 *  - Validates name and code
 *  - Prevents duplicate category name or code within store
 *  - Stores in public.categories table
 *  - Returns newly created category
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["categories.create", "categories.manage"]);
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

        const name = String(body.name || "").trim();
        if (!name) {
            return Response.json(
                { success: false, message: "Category name is required." },
                { status: 400 }
            );
        }

        const rawCode = body.code !== undefined ? String(body.code).trim() : null;
        const code = rawCode && rawCode.length > 0 ? rawCode.toUpperCase() : null;
        const description = String(body.description || "").trim();

        let status = "Active";
        if (body.isActive === false || body.status === "Inactive") {
            status = "Inactive";
        }

        if (!isSupabaseAdminConfigured()) {
            return Response.json(
                { success: false, message: "Server database configuration is missing." },
                { status: 503 }
            );
        }

        const admin = getSupabaseAdmin();

        // Resolve store_id
        let targetStoreId = body.storeId || auth.user?.storeId || auth.user?.store_id;
        if (!targetStoreId) {
            const { data: defaultStore } = await admin
                .from("stores")
                .select("id")
                .limit(1)
                .maybeSingle();

            if (!defaultStore) {
                return Response.json(
                    { success: false, message: "No active store found to associate category." },
                    { status: 400 }
                );
            }
            targetStoreId = defaultStore.id;
        }

        // 1. Prevent duplicate category name in this store
        const { data: existingName } = await admin
            .from("categories")
            .select("id")
            .eq("store_id", targetStoreId)
            .ilike("name", name)
            .maybeSingle();

        if (existingName) {
            return Response.json(
                { success: false, message: `A category named "${name}" already exists.` },
                { status: 409 }
            );
        }

        // 2. Prevent duplicate category code in this store if code is provided
        if (code) {
            const { data: existingCode } = await admin
                .from("categories")
                .select("id")
                .eq("store_id", targetStoreId)
                .ilike("code", code)
                .maybeSingle();

            if (existingCode) {
                return Response.json(
                    { success: false, message: `Category code "${code}" is already in use.` },
                    { status: 409 }
                );
            }
        }

        const now = new Date().toISOString();
        const insertPayload = {
            store_id: targetStoreId,
            name,
            code,
            description,
            status,
            created_at: now,
            updated_at: now,
        };

        const { data: created, error: insertErr } = await admin
            .from("categories")
            .insert(insertPayload)
            .select("id, store_id, name, code, description, status, created_at, updated_at")
            .maybeSingle();

        if (insertErr) {
            // Handle if code column not yet added or constraint violation
            if (insertErr.message?.includes("code") && insertErr.message?.includes("column")) {
                const { data: fallbackCreated, error: fallbackErr } = await admin
                    .from("categories")
                    .insert({
                        store_id: targetStoreId,
                        name,
                        description,
                        status,
                        created_at: now,
                        updated_at: now,
                    })
                    .select("id, store_id, name, description, status, created_at, updated_at")
                    .maybeSingle();

                if (fallbackErr) {
                    return Response.json(
                        { success: false, message: `Failed to create category: ${fallbackErr.message}` },
                        { status: 500 }
                    );
                }

                const fallbackFormatted = {
                    id: fallbackCreated.id,
                    name: fallbackCreated.name,
                    code: null,
                    description: fallbackCreated.description || "",
                    status: fallbackCreated.status || "Active",
                    isActive: fallbackCreated.status === "Active",
                    productCount: 0,
                    storeId: fallbackCreated.store_id,
                    createdAt: fallbackCreated.created_at,
                    updatedAt: fallbackCreated.updated_at,
                };

                return Response.json(
                    {
                        success: true,
                        message: "Category created successfully.",
                        data: { category: fallbackFormatted },
                        category: fallbackFormatted,
                    },
                    { status: 201 }
                );
            }

            return Response.json(
                { success: false, message: `Failed to create category: ${insertErr.message}` },
                { status: 500 }
            );
        }

        const formatted = {
            id: created.id,
            name: created.name,
            code: created.code || null,
            description: created.description || "",
            status: created.status || "Active",
            isActive: created.status === "Active",
            productCount: 0,
            storeId: created.store_id,
            createdAt: created.created_at,
            updatedAt: created.updated_at,
        };

        return Response.json(
            {
                success: true,
                message: "Category created successfully.",
                data: {
                    category: formatted,
                },
                category: formatted,
            },
            { status: 201 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Internal server error while creating category." },
            { status: 500 }
        );
    }
}

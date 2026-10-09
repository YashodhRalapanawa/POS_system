import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/suppliers
 * Retrieves supplier records.
 *
 * Requirements:
 *  - Supabase authentication required
 *  - suppliers.view (or suppliers.manage fallback) permission required
 *  - Real supplier records from Supabase
 *  - Search by name, code, contact person, email, or phone
 *  - Active/inactive filtering
 *  - Type filtering
 *  - Pagination and 'all=true' support
 *  - Consistent API response
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["suppliers.view", "suppliers.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const url = new URL(request.url);
        const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
        const statusFilter = (url.searchParams.get("status") || "").trim();
        const typeFilter = (url.searchParams.get("type") || url.searchParams.get("supplierType") || "").trim();
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

        // 1. Query suppliers_with_counts view if available, or suppliers table
        let query = admin
            .from("suppliers_with_counts")
            .select("*", { count: "exact" });

        // Status filter
        if (statusFilter && statusFilter !== "All Status" && statusFilter !== "All") {
            query = query.eq("status", statusFilter);
        }

        // Supplier type filter
        if (typeFilter && typeFilter !== "All Types" && typeFilter !== "All") {
            query = query.eq("supplier_type", typeFilter);
        }

        // Search filter (name, code, contact_person, email, phone)
        if (search) {
            const cleanSearch = search.replace(/[%_,]/g, "");
            if (cleanSearch) {
                query = query.or(
                    `name.ilike.%${cleanSearch}%,code.ilike.%${cleanSearch}%,contact_person.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%`
                );
            }
        }

        // Store scoping
        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            query = query.eq("store_id", userStoreId);
        }

        query = query.order("name", { ascending: true }).range(offset, offset + limit - 1);

        let { data: suppliers, count, error } = await query;

        // Fallback to direct suppliers table if view not found
        if (error) {
            let fallbackQuery = admin
                .from("suppliers")
                .select(`
                    id, store_id, code, name, contact_person, phone, email, address, city, country, supplier_type, status, created_at, updated_at,
                    products:products (count)
                `, { count: "exact" });

            if (statusFilter && statusFilter !== "All Status" && statusFilter !== "All") {
                fallbackQuery = fallbackQuery.eq("status", statusFilter);
            }

            if (typeFilter && typeFilter !== "All Types" && typeFilter !== "All") {
                fallbackQuery = fallbackQuery.eq("supplier_type", typeFilter);
            }

            if (search) {
                const cleanSearch = search.replace(/[%_,]/g, "");
                if (cleanSearch) {
                    fallbackQuery = fallbackQuery.or(
                        `name.ilike.%${cleanSearch}%,code.ilike.%${cleanSearch}%,contact_person.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%`
                    );
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
                    { success: false, message: `Failed to retrieve suppliers: ${fallbackRes.error.message}` },
                    { status: 500 }
                );
            }

            suppliers = (fallbackRes.data || []).map((s) => ({
                ...s,
                product_count: Array.isArray(s.products) && s.products[0] ? s.products[0].count : 0,
            }));
            count = fallbackRes.count;
        }

        const total = count ?? (suppliers?.length || 0);
        const totalPages = Math.ceil(total / limit) || 1;

        const formatted = (suppliers || []).map((s) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            contactPerson: s.contact_person || "",
            email: s.email || "",
            phone: s.phone || "",
            address: s.address || "",
            city: s.city || "",
            country: s.country || "",
            supplierType: s.supplier_type || "Local Supplier",
            status: s.status || "Active",
            isActive: s.status === "Active",
            productCount: Number(s.product_count ?? s.products_count ?? 0),
            storeId: s.store_id,
            createdAt: s.created_at || null,
            updatedAt: s.updated_at || null,
        }));

        return Response.json(
            {
                success: true,
                message: "Suppliers retrieved successfully.",
                data: {
                    suppliers: formatted,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages,
                        hasNext: page < totalPages,
                        hasPrev: page > 1,
                    },
                },
                suppliers: formatted,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Internal server error while fetching suppliers." },
            { status: 500 }
        );
    }
}

/**
 * POST /api/suppliers
 * Creates a new supplier in Supabase.
 *
 * Requirements:
 *  - Supabase authentication required
 *  - suppliers.create (or suppliers.manage fallback) permission required
 *  - Validates name and code
 *  - Validates email format if provided
 *  - Prevents duplicate supplier code within the store
 *  - Saves in public.suppliers table
 *  - Returns newly created supplier
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["suppliers.create", "suppliers.manage"]);
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
                { success: false, message: "Supplier name is required." },
                { status: 400 }
            );
        }

        const rawCode = String(body.code || "").trim();
        if (!rawCode) {
            return Response.json(
                { success: false, message: "Supplier code is required." },
                { status: 400 }
            );
        }
        const code = rawCode.toUpperCase();

        const email = String(body.email || "").trim().toLowerCase();
        if (email && !/^\S+@\S+\.\S+$/.test(email)) {
            return Response.json(
                { success: false, message: "Please enter a valid email address." },
                { status: 400 }
            );
        }

        const contactPerson = String(body.contactPerson ?? body.contact_person ?? "").trim();
        const phone = String(body.phone || "").trim();
        const address = String(body.address || "").trim();
        const city = String(body.city || "").trim();
        const country = String(body.country || "").trim();

        let supplierType = body.supplierType || body.supplier_type || "Local Supplier";
        const allowedTypes = ["Manufacturer", "Distributor", "Wholesaler", "Local Supplier"];
        if (!allowedTypes.includes(supplierType)) {
            supplierType = "Local Supplier";
        }

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
                    { success: false, message: "No active store found to associate supplier." },
                    { status: 400 }
                );
            }
            targetStoreId = defaultStore.id;
        }

        // 1. Prevent duplicate supplier code within this store
        const { data: existingCode } = await admin
            .from("suppliers")
            .select("id")
            .eq("store_id", targetStoreId)
            .ilike("code", code)
            .maybeSingle();

        if (existingCode) {
            return Response.json(
                { success: false, message: `Supplier code "${code}" is already in use.` },
                { status: 409 }
            );
        }

        // 2. Prevent duplicate supplier name within this store
        const { data: existingName } = await admin
            .from("suppliers")
            .select("id")
            .eq("store_id", targetStoreId)
            .ilike("name", name)
            .maybeSingle();

        if (existingName) {
            return Response.json(
                { success: false, message: `A supplier named "${name}" already exists.` },
                { status: 409 }
            );
        }

        const now = new Date().toISOString();
        const insertPayload = {
            store_id: targetStoreId,
            code,
            name,
            contact_person: contactPerson,
            phone,
            email,
            address,
            city,
            country,
            supplier_type: supplierType,
            status,
            created_at: now,
            updated_at: now,
        };

        const { data: created, error: insertErr } = await admin
            .from("suppliers")
            .insert(insertPayload)
            .select("*")
            .maybeSingle();

        if (insertErr) {
            return Response.json(
                { success: false, message: `Failed to create supplier: ${insertErr.message}` },
                { status: 500 }
            );
        }

        const formatted = {
            id: created.id,
            code: created.code,
            name: created.name,
            contactPerson: created.contact_person || "",
            email: created.email || "",
            phone: created.phone || "",
            address: created.address || "",
            city: created.city || "",
            country: created.country || "",
            supplierType: created.supplier_type,
            status: created.status,
            isActive: created.status === "Active",
            productCount: 0,
            storeId: created.store_id,
            createdAt: created.created_at,
            updatedAt: created.updated_at,
        };

        return Response.json(
            {
                success: true,
                message: "Supplier created successfully.",
                data: {
                    supplier: formatted,
                },
                supplier: formatted,
            },
            { status: 201 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Internal server error while creating supplier." },
            { status: 500 }
        );
    }
}

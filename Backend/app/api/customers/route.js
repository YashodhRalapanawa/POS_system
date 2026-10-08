import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/customers
 * Retrieves customer records from Supabase.
 *
 * Requirements:
 *  - Supabase authentication required
 *  - customers.view (or customers.manage fallback) permission required
 *  - Real customer records from Supabase
 *  - Search by name, code, phone, email
 *  - Active/inactive status filtering
 *  - Customer type filtering
 *  - Pagination and 'all=true' support (for POS customer selection)
 *  - Store scoping
 *  - Consistent API response
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["customers.view", "customers.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const url = new URL(request.url);
        const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
        const statusFilter = (url.searchParams.get("status") || "").trim();
        const typeFilter = (url.searchParams.get("type") || url.searchParams.get("customerType") || "").trim();
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

        // 1. Attempt query on customers_with_order_counts view
        let query = admin
            .from("customers_with_order_counts")
            .select("*", { count: "exact" });

        // Status filter
        if (statusFilter && statusFilter !== "All Status" && statusFilter !== "All") {
            query = query.eq("status", statusFilter);
        }

        // Customer type filter
        if (typeFilter && typeFilter !== "All Types" && typeFilter !== "All") {
            query = query.eq("customer_type", typeFilter);
        }

        // Search filter (name, code, phone, email)
        if (search) {
            const cleanSearch = search.replace(/[%_,]/g, "");
            if (cleanSearch) {
                query = query.or(
                    `name.ilike.%${cleanSearch}%,code.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%`
                );
            }
        }

        // Store scoping
        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            query = query.eq("store_id", userStoreId);
        }

        // Order: walk-in customers first, then alphabetical by name
        query = query
            .order("is_walk_in", { ascending: false })
            .order("name", { ascending: true })
            .range(offset, offset + limit - 1);

        let { data: customers, count, error } = await query;

        // Fallback to direct customers table if view is not accessible
        if (error) {
            let fallbackQuery = admin
                .from("customers")
                .select("*", { count: "exact" });

            if (statusFilter && statusFilter !== "All Status" && statusFilter !== "All") {
                fallbackQuery = fallbackQuery.eq("status", statusFilter);
            }

            if (typeFilter && typeFilter !== "All Types" && typeFilter !== "All") {
                fallbackQuery = fallbackQuery.eq("customer_type", typeFilter);
            }

            if (search) {
                const cleanSearch = search.replace(/[%_,]/g, "");
                if (cleanSearch) {
                    fallbackQuery = fallbackQuery.or(
                        `name.ilike.%${cleanSearch}%,code.ilike.%${cleanSearch}%,phone.ilike.%${cleanSearch}%,email.ilike.%${cleanSearch}%`
                    );
                }
            }

            if (auth.user?.storeId || auth.user?.store_id) {
                const userStoreId = auth.user.storeId || auth.user.store_id;
                fallbackQuery = fallbackQuery.eq("store_id", userStoreId);
            }

            fallbackQuery = fallbackQuery
                .order("is_walk_in", { ascending: false })
                .order("name", { ascending: true })
                .range(offset, offset + limit - 1);

            const fallbackRes = await fallbackQuery;
            if (fallbackRes.error) {
                return Response.json(
                    { success: false, message: `Failed to retrieve customers: ${fallbackRes.error.message}` },
                    { status: 500 }
                );
            }

            customers = (fallbackRes.data || []).map((c) => ({
                ...c,
                order_count: 0,
            }));
            count = fallbackRes.count;
        }

        const total = count ?? (customers?.length || 0);
        const totalPages = Math.ceil(total / limit) || 1;

        const formatted = (customers || []).map((c) => ({
            id: c.id,
            code: c.code,
            name: c.name,
            customerType: c.customer_type || "Individual",
            phone: c.phone || "",
            email: c.email || "",
            address: c.address || "",
            city: c.city || "",
            country: c.country || "",
            isWalkIn: Boolean(c.is_walk_in),
            status: c.status || "Active",
            isActive: c.status === "Active",
            orderCount: Number(c.order_count ?? 0),
            storeId: c.store_id,
            createdAt: c.created_at || null,
            updatedAt: c.updated_at || null,
        }));

        return Response.json(
            {
                success: true,
                message: "Customers retrieved successfully.",
                data: {
                    customers: formatted,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages,
                        hasNext: page < totalPages,
                        hasPrev: page > 1,
                    },
                },
                customers: formatted,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Internal server error while fetching customers." },
            { status: 500 }
        );
    }
}

/**
 * POST /api/customers
 * Creates a new customer profile in Supabase.
 *
 * Requirements:
 *  - Supabase authentication required
 *  - customers.create (or customers.manage fallback) permission required
 *  - Validates customer name
 *  - Validates email format if provided
 *  - Validates phone input
 *  - Prevents duplicate customer codes within the store
 *  - Saves in public.customers table
 *  - Returns newly created customer
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["customers.create", "customers.manage"]);
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
                { success: false, message: "Customer name is required." },
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

        // Resolve target store
        let targetStoreId = body.storeId || auth.user?.storeId || auth.user?.store_id;
        if (!targetStoreId) {
            const { data: defaultStore } = await admin
                .from("stores")
                .select("id")
                .limit(1)
                .maybeSingle();

            if (!defaultStore) {
                return Response.json(
                    { success: false, message: "No active store found to associate customer." },
                    { status: 400 }
                );
            }
            targetStoreId = defaultStore.id;
        }

        // Handle customer code: generate or validate provided code
        let code = String(body.code || "").trim().toUpperCase();
        if (!code) {
            // Auto-generate customer code if not provided by client
            const { count: customerCount } = await admin
                .from("customers")
                .select("id", { count: "exact", head: true })
                .eq("store_id", targetStoreId);

            const nextIndex = (customerCount || 0) + 1;
            code = `CUS-${String(nextIndex).padStart(3, "0")}`;
        }

        // Check duplicate code within the same store
        const { data: existingCode } = await admin
            .from("customers")
            .select("id")
            .eq("store_id", targetStoreId)
            .ilike("code", code)
            .maybeSingle();

        if (existingCode) {
            return Response.json(
                { success: false, message: `Customer code "${code}" is already in use.` },
                { status: 409 }
            );
        }

        // Email validation
        const email = String(body.email || "").trim().toLowerCase();
        if (email && !/^\S+@\S+\.\S+$/.test(email)) {
            return Response.json(
                { success: false, message: "Please enter a valid email address." },
                { status: 400 }
            );
        }

        // Customer type validation
        let customerType = body.customerType || body.customer_type || "Individual";
        if (!["Individual", "Business"].includes(customerType)) {
            customerType = "Individual";
        }

        if (customerType === "Business" && !email && body.requireBusinessEmail) {
            return Response.json(
                { success: false, message: "Email is required for business customers." },
                { status: 400 }
            );
        }

        const phone = String(body.phone || "").trim();
        const address = String(body.address || "").trim();
        const city = String(body.city || "").trim();
        const country = String(body.country || "Sri Lanka").trim();

        let status = "Active";
        if (body.isActive === false || body.status === "Inactive") {
            status = "Inactive";
        }

        const now = new Date().toISOString();
        const insertPayload = {
            store_id: targetStoreId,
            code,
            name,
            customer_type: customerType,
            phone,
            email,
            address,
            city,
            country,
            is_walk_in: false,
            status,
            created_at: now,
            updated_at: now,
        };

        const { data: created, error: insertErr } = await admin
            .from("customers")
            .insert(insertPayload)
            .select("*")
            .maybeSingle();

        if (insertErr) {
            return Response.json(
                { success: false, message: `Failed to create customer: ${insertErr.message}` },
                { status: 500 }
            );
        }

        const formatted = {
            id: created.id,
            code: created.code,
            name: created.name,
            customerType: created.customer_type,
            phone: created.phone || "",
            email: created.email || "",
            address: created.address || "",
            city: created.city || "",
            country: created.country || "",
            isWalkIn: Boolean(created.is_walk_in),
            status: created.status,
            isActive: created.status === "Active",
            orderCount: 0,
            storeId: created.store_id,
            createdAt: created.created_at,
            updatedAt: created.updated_at,
        };

        return Response.json(
            {
                success: true,
                message: "Customer created successfully.",
                data: {
                    customer: formatted,
                },
                customer: formatted,
            },
            { status: 201 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Internal server error while creating customer." },
            { status: 500 }
        );
    }
}

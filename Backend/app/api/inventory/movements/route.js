import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventory/movements
 * Retrieves inventory movement history for audit and traceability.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["inventory.view", "inventory.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const url = new URL(request.url);
        const productId = (url.searchParams.get("productId") || "").trim();
        const storeId = (url.searchParams.get("storeId") || url.searchParams.get("store") || "").trim();
        const movementType = (url.searchParams.get("movementType") || url.searchParams.get("type") || "").trim();
        const startDate = (url.searchParams.get("startDate") || "").trim();
        const endDate = (url.searchParams.get("endDate") || "").trim();
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

        let query = admin
            .from("stock_movements")
            .select(`
                id, store_id, product_id, adjustment_type, reason, notes,
                quantity, quantity_change, quantity_before, quantity_after,
                reference_type, reference_id, created_by, created_at,
                product:products(id, name, sku, barcode),
                store:stores(id, name),
                creator:users!stock_movements_created_by_fkey(id, full_name, email)
            `, { count: "exact" });

        // Scoping by user store
        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            query = query.eq("store_id", userStoreId);
        } else if (storeId && storeId !== "All Stores" && storeId !== "All") {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
            if (isUuid) {
                query = query.eq("store_id", storeId);
            }
        }

        // Product filter
        if (productId) {
            query = query.eq("product_id", productId);
        }

        // Movement type filter
        if (movementType && movementType !== "All Types" && movementType !== "All") {
            query = query.eq("adjustment_type", movementType);
        }

        // Date range filters
        if (startDate) {
            query = query.gte("created_at", startDate);
        }
        if (endDate) {
            query = query.lte("created_at", endDate);
        }

        query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

        const { data: movements, count, error } = await query;

        if (error) {
            // Fallback query if creator foreign key alias differs
            const fallbackRes = await admin
                .from("stock_movements")
                .select(`
                    id, store_id, product_id, adjustment_type, reason, notes,
                    quantity, quantity_change, quantity_before, quantity_after,
                    reference_type, reference_id, created_by, created_at,
                    product:products(id, name, sku, barcode),
                    store:stores(id, name)
                `, { count: "exact" })
                .order("created_at", { ascending: false })
                .range(offset, offset + limit - 1);

            if (fallbackRes.error) {
                return Response.json(
                    { success: false, message: `Failed to retrieve movement history: ${fallbackRes.error.message}` },
                    { status: 500 }
                );
            }

            const formattedFallback = (fallbackRes.data || []).map((m) => formatMovement(m));
            return Response.json({
                success: true,
                data: {
                    movements: formattedFallback,
                    pagination: {
                        page,
                        pageSize: limit,
                        total: fallbackRes.count ?? formattedFallback.length,
                        totalPages: Math.ceil((fallbackRes.count ?? formattedFallback.length) / limit) || 1,
                    },
                },
            });
        }

        const formatted = (movements || []).map((m) => formatMovement(m));
        const total = count ?? formatted.length;
        const totalPages = Math.ceil(total / limit) || 1;

        return Response.json({
            success: true,
            data: {
                movements: formatted,
                pagination: {
                    page,
                    pageSize: limit,
                    total,
                    totalPages,
                },
            },
        });
    } catch (err) {
        return Response.json(
            { success: false, message: "An unexpected error occurred while fetching movement history." },
            { status: 500 }
        );
    }
}

function formatMovement(m) {
    const prod = m.product && typeof m.product === "object" ? m.product : null;
    const store = m.store && typeof m.store === "object" ? m.store : null;
    const creator = m.creator && typeof m.creator === "object" ? m.creator : null;

    return {
        id: m.id,
        productId: m.product_id,
        productName: prod ? prod.name : "Product",
        sku: prod ? prod.sku : "",
        barcode: prod ? prod.barcode : "",
        storeId: m.store_id,
        storeName: store ? store.name : "Store",
        movementType: m.adjustment_type,
        adjustmentType: m.adjustment_type,
        quantity: m.quantity,
        quantityChange: m.quantity_change,
        quantityBefore: m.quantity_before,
        quantityAfter: m.quantity_after,
        previousStock: m.quantity_before,
        newStock: m.quantity_after,
        referenceType: m.reference_type,
        referenceId: m.reference_id,
        reason: m.reason || m.notes || "Stock adjustment",
        notes: m.notes || "",
        createdBy: creator ? creator.full_name : (m.created_by || "System"),
        createdAt: m.created_at,
    };
}

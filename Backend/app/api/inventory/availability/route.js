import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../lib/responses/index.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/inventory/availability
 * Retrieves real-time stock balances for specified products in a store.
 *
 * Requirements:
 *  - Require authentication & inventory.view (or pos.use / inventory.manage) permission
 *  - Verify store access (cashiers can only view their assigned store)
 *  - Retrieve actual stock balances from Supabase (never mock data)
 *  - Support multiple product IDs in one single batch request
 *  - Handle products with missing inventory rows as 0 available stock
 *  - Return consistent API responses
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "inventory.view",
            "inventory.manage",
            "pos.use",
            "pos_orders.view",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const url = new URL(request.url);
        const requestedStoreId = (url.searchParams.get("storeId") || url.searchParams.get("store") || "").trim();
        const rawProductIds = (url.searchParams.get("productIds") || url.searchParams.get("products") || "").trim();

        const authUserStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";

        // Store access verification
        const effectiveStoreId = requestedStoreId || authUserStoreId;
        if (!effectiveStoreId) {
            return errorResponse("storeId parameter is required.", 400);
        }

        if (authUserStoreId && effectiveStoreId !== authUserStoreId && !isAdmin) {
            return errorResponse("You do not have access to view inventory for the selected store.", 403);
        }

        if (!rawProductIds) {
            return errorResponse("productIds parameter is required (comma-separated list of UUIDs).", 400);
        }

        const productIds = rawProductIds
            .split(",")
            .map((id) => id.trim())
            .filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

        if (productIds.length === 0) {
            return errorResponse("No valid product UUIDs provided in productIds parameter.", 400);
        }

        const admin = getSupabaseAdmin();

        // 1. Fetch store negative stock policy
        const { data: storeSetting } = await admin
            .from("store_settings")
            .select("allow_negative_stock")
            .eq("store_id", effectiveStoreId)
            .maybeSingle();

        const allowNegativeStock = Boolean(storeSetting?.allow_negative_stock);

        // 2. Try RPC function get_product_stock_availability first
        const { data: rpcRows, error: rpcErr } = await admin.rpc("get_product_stock_availability", {
            p_store_id: effectiveStoreId,
            p_product_ids: productIds,
        });

        if (!rpcErr && Array.isArray(rpcRows) && rpcRows.length > 0) {
            const formattedItems = rpcRows.map((row) => ({
                productId: row.product_id,
                currentStock: Number(row.current_stock ?? 0),
                reservedStock: Number(row.reserved_stock ?? 0),
                availableQuantity: Number(row.available_quantity ?? 0),
                unitOfMeasure: row.unit_of_measure || "PCS",
                isActive: Boolean(row.is_active),
            }));

            return successResponse({
                storeId: effectiveStoreId,
                allowNegativeStock,
                items: formattedItems,
            }, "Stock availability retrieved successfully");
        }

        // 3. Fallback direct batch query across products and inventory tables
        const { data: products, error: prodErr } = await admin
            .from("products")
            .select(`
                id, name, sku, status, unit_of_measure, selling_price,
                inventory (id, current_stock, reserved_stock, updated_at)
            `)
            .eq("store_id", effectiveStoreId)
            .in("id", productIds);

        if (prodErr) {
            return errorResponse(`Failed to query stock availability: ${prodErr.message}`, 500);
        }

        const itemsMap = new Map();
        (products || []).forEach((prod) => {
            const inv = Array.isArray(prod.inventory) && prod.inventory[0] ? prod.inventory[0] : null;
            const currentStock = inv ? Number(inv.current_stock ?? 0) : 0;
            const reservedStock = inv ? Number(inv.reserved_stock ?? 0) : 0;
            const availableQuantity = currentStock - reservedStock;

            itemsMap.set(prod.id, {
                productId: prod.id,
                productName: prod.name,
                sku: prod.sku,
                currentStock,
                reservedStock,
                availableQuantity,
                unitOfMeasure: prod.unit_of_measure || "PCS",
                isActive: prod.status === "Active",
            });
        });

        // Ensure every requested product has an entry (missing products return 0 available)
        const availabilityItems = productIds.map((id) => {
            if (itemsMap.has(id)) {
                return itemsMap.get(id);
            }
            return {
                productId: id,
                productName: "Unknown Product",
                sku: "",
                currentStock: 0,
                reservedStock: 0,
                availableQuantity: 0,
                unitOfMeasure: "PCS",
                isActive: false,
            };
        });

        return successResponse({
            storeId: effectiveStoreId,
            allowNegativeStock,
            items: availabilityItems,
        }, "Stock availability retrieved successfully");
    } catch (err) {
        return errorResponse("An unexpected error occurred while fetching stock availability.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../../lib/auth/authorize.js";
import { errorResponse } from "../../../../../lib/responses/index.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/pos/orders/validate-stock
 * Validates requested cart quantities against actual store stock balances.
 *
 * Requirements:
 *  - Require authentication & POS order permission
 *  - Validate store access
 *  - Validate product IDs & quantities
 *  - Aggregate duplicate product quantities
 *  - Retrieve authoritative stock balances from Supabase
 *  - Compare requested quantities against available stock
 *  - Apply store negative-stock policy (store_settings.allow_negative_stock)
 *  - Return item-level validation results without changing stock quantities
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "pos_orders.create",
            "pos_orders.update",
            "pos.use",
            "inventory.view",
            "orders.create",
            "orders.manage",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON request payload.", 400);
        }

        const authUserStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const requestedStoreId = body.storeId || body.store_id || authUserStoreId;

        if (!requestedStoreId) {
            return errorResponse("storeId is required.", 400);
        }

        if (authUserStoreId && requestedStoreId !== authUserStoreId && !isAdmin) {
            return errorResponse("You do not have access to the selected store.", 403);
        }

        const rawItems = Array.isArray(body.items) ? body.items : [];
        if (rawItems.length === 0) {
            return errorResponse("Items array cannot be empty.", 400);
        }

        const admin = getSupabaseAdmin();

        // 1. Fetch store negative stock policy
        const { data: storeSetting } = await admin
            .from("store_settings")
            .select("allow_negative_stock")
            .eq("store_id", requestedStoreId)
            .maybeSingle();

        const allowNegativeStock = Boolean(storeSetting?.allow_negative_stock);

        // 2. Aggregate duplicate product quantities
        const aggregatedQuantities = new Map();
        for (const it of rawItems) {
            const pId = it.productId || it.product_id;
            const qty = Number(it.quantity);

            if (!pId) {
                return errorResponse("Product ID is required for each item.", 400);
            }
            if (!Number.isFinite(qty) || qty <= 0) {
                return errorResponse("Item quantities must be positive numbers.", 400);
            }

            const currentSum = aggregatedQuantities.get(pId) || 0;
            aggregatedQuantities.set(pId, currentSum + qty);
        }

        const uniqueProductIds = Array.from(aggregatedQuantities.keys());

        // 3. Try PostgreSQL RPC validate_pos_order_stock first
        const { data: rpcResult, error: rpcErr } = await admin.rpc("validate_pos_order_stock", {
            p_store_id: requestedStoreId,
            p_items: rawItems.map((it) => ({
                productId: it.productId || it.product_id,
                quantity: it.quantity,
            })),
        });

        if (!rpcErr && rpcResult && Array.isArray(rpcResult.items)) {
            const formattedItems = rpcResult.items.map((it) => ({
                productId: it.productId,
                productName: it.productName,
                sku: it.sku,
                requestedQuantity: Number(it.requestedQuantity),
                currentStock: Number(it.currentStock ?? 0),
                reservedStock: Number(it.reservedStock ?? 0),
                availableQuantity: Number(it.availableQuantity ?? 0),
                valid: Boolean(it.valid),
                message: it.message || (it.valid ? "Sufficient stock" : "Insufficient stock"),
            }));

            return Response.json({
                success: true,
                valid: Boolean(rpcResult.valid),
                allowNegativeStock: Boolean(rpcResult.allowNegativeStock),
                items: formattedItems,
                data: {
                    valid: Boolean(rpcResult.valid),
                    allowNegativeStock: Boolean(rpcResult.allowNegativeStock),
                    items: formattedItems,
                },
            }, { status: 200 });
        }

        // 4. Fallback direct validation query
        const { data: products, error: prodErr } = await admin
            .from("products")
            .select(`
                id, name, sku, status,
                inventory (current_stock, reserved_stock)
            `)
            .eq("store_id", requestedStoreId)
            .in("id", uniqueProductIds);

        if (prodErr) {
            return errorResponse(`Failed to validate stock: ${prodErr.message}`, 500);
        }

        const productMap = new Map();
        (products || []).forEach((p) => {
            productMap.set(p.id, p);
        });

        let overallValid = true;
        const validationResults = [];

        for (const productId of uniqueProductIds) {
            const requestedQty = aggregatedQuantities.get(productId);
            const prod = productMap.get(productId);

            if (!prod) {
                overallValid = false;
                validationResults.push({
                    productId,
                    productName: "Unknown Product",
                    sku: "",
                    requestedQuantity: requestedQty,
                    currentStock: 0,
                    reservedStock: 0,
                    availableQuantity: 0,
                    valid: false,
                    message: "Product not found in this store",
                });
                continue;
            }

            if (prod.status !== "Active") {
                overallValid = false;
                validationResults.push({
                    productId,
                    productName: prod.name,
                    sku: prod.sku,
                    requestedQuantity: requestedQty,
                    currentStock: 0,
                    reservedStock: 0,
                    availableQuantity: 0,
                    valid: false,
                    message: `Product "${prod.name}" is inactive`,
                });
                continue;
            }

            const inv = Array.isArray(prod.inventory) && prod.inventory[0] ? prod.inventory[0] : null;
            const currentStock = inv ? Number(inv.current_stock ?? 0) : 0;
            const reservedStock = inv ? Number(inv.reserved_stock ?? 0) : 0;
            const availableQuantity = currentStock - reservedStock;

            let itemValid = true;
            let itemMessage = "Sufficient stock";

            if (requestedQty > availableQuantity) {
                if (allowNegativeStock) {
                    itemValid = true;
                    itemMessage = `Low stock (${availableQuantity} available). Negative stock permitted.`;
                } else {
                    itemValid = false;
                    itemMessage = `Insufficient stock: ${availableQuantity} available, ${requestedQty} requested`;
                    overallValid = false;
                }
            }

            validationResults.push({
                productId: prod.id,
                productName: prod.name,
                sku: prod.sku,
                requestedQuantity: requestedQty,
                currentStock,
                reservedStock,
                availableQuantity,
                valid: itemValid,
                message: itemMessage,
            });
        }

        return Response.json({
            success: true,
            valid: overallValid,
            allowNegativeStock,
            items: validationResults,
            data: {
                valid: overallValid,
                allowNegativeStock,
                items: validationResults,
            },
        }, { status: 200 });
    } catch (err) {
        return errorResponse("An unexpected error occurred while validating stock.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

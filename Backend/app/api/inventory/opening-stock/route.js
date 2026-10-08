import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/inventory/opening-stock
 * Records opening stock for a product in a store.
 *
 * Requirements:
 *  - Authentication required.
 *  - inventory.adjust or inventory.manage permission required.
 *  - Validates product and store existence.
 *  - Validates positive quantity.
 *  - Prevents duplicate opening stock (if stock or movements already exist).
 *  - Records stock movement and updates balance atomically via trigger.
 *  - Returns updated stock information.
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["inventory.adjust", "inventory.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return Response.json(
                { success: false, message: "Invalid JSON request payload." },
                { status: 400 }
            );
        }

        const productId = body.productId || body.product_id;
        let storeId = body.storeId || body.store_id;
        const quantity = parseInt(body.quantity, 10);
        const reason = String(body.reason || "Initial stock entry").trim();

        if (!productId) {
            return Response.json(
                { success: false, message: "Product ID is required." },
                { status: 400 }
            );
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            return Response.json(
                { success: false, message: "Quantity must be a positive integer greater than zero." },
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

        // If user is scoped to a specific store, enforce it
        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            if (storeId && storeId !== userStoreId) {
                return Response.json(
                    { success: false, message: "You are not authorized to set stock for this store." },
                    { status: 403 }
                );
            }
            storeId = userStoreId;
        }

        // Validate product existence
        const { data: product, error: prodError } = await admin
            .from("products")
            .select("id, name, sku, store_id")
            .eq("id", productId)
            .maybeSingle();

        if (prodError || !product) {
            return Response.json(
                { success: false, message: "Product not found." },
                { status: 404 }
            );
        }

        // If storeId not supplied, fallback to product's store_id
        if (!storeId) {
            storeId = product.store_id;
        }

        // Validate store existence
        const { data: storeData } = await admin
            .from("stores")
            .select("id, name")
            .eq("id", storeId)
            .maybeSingle();

        if (!storeData) {
            return Response.json(
                { success: false, message: "Store not found." },
                { status: 404 }
            );
        }

        // 1. Prevent duplicate opening stock: check if inventory already exists with stock > 0
        const { data: existingInventory } = await admin
            .from("inventory")
            .select("id, current_stock")
            .eq("product_id", productId)
            .eq("store_id", storeId)
            .maybeSingle();

        if (existingInventory && existingInventory.current_stock > 0) {
            return Response.json(
                {
                    success: false,
                    message: "Stock has already been recorded for this product. Use a stock adjustment instead.",
                },
                { status: 400 }
            );
        }

        // Check if opening stock movement has already been recorded
        const { data: existingMovement } = await admin
            .from("stock_movements")
            .select("id")
            .eq("product_id", productId)
            .eq("store_id", storeId)
            .in("adjustment_type", ["Opening Stock", "Set Stock Level"])
            .limit(1)
            .maybeSingle();

        if (existingMovement) {
            return Response.json(
                {
                    success: false,
                    message: "Opening stock has already been recorded for this product. Use a stock adjustment instead.",
                },
                { status: 400 }
            );
        }

        // 2. Insert stock movement (atomic update handled by PostgreSQL trigger apply_stock_movement)
        const movementPayload = {
            store_id: storeId,
            product_id: productId,
            adjustment_type: "Opening Stock",
            reason: "Stock Count",
            notes: reason || "Initial stock entry",
            quantity,
            reference_type: "adjustment",
            created_by: auth.user?.id || null,
        };

        const { data: movement, error: movError } = await admin
            .from("stock_movements")
            .insert(movementPayload)
            .select()
            .single();

        if (movError) {
            return Response.json(
                { success: false, message: `Failed to record opening stock: ${movError.message}` },
                { status: 500 }
            );
        }

        // 3. Retrieve final updated inventory
        const { data: updatedInv } = await admin
            .from("inventory")
            .select("id, current_stock, reserved_stock, updated_at")
            .eq("product_id", productId)
            .eq("store_id", storeId)
            .maybeSingle();

        return Response.json(
            {
                success: true,
                message: `Opening stock of ${quantity} successfully recorded for "${product.name}".`,
                data: {
                    productId: product.id,
                    productName: product.name,
                    sku: product.sku,
                    storeId,
                    storeName: storeData.name,
                    currentStock: updatedInv?.current_stock ?? quantity,
                    stock: updatedInv?.current_stock ?? quantity,
                    movementId: movement?.id,
                    updatedAt: updatedInv?.updated_at || new Date().toISOString(),
                },
            },
            { status: 201 }
        );
    } catch (err) {
        return Response.json(
            { success: false, message: "An unexpected error occurred while saving opening stock." },
            { status: 500 }
        );
    }
}

import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

function normalizeAdjustmentType(type) {
    const lower = String(type || "").trim().toLowerCase();
    if (lower === "increase" || lower === "add stock" || lower === "add") {
        return "Add Stock";
    }
    if (lower === "decrease" || lower === "remove stock" || lower === "remove") {
        return "Remove Stock";
    }
    if (lower === "set" || lower === "set stock level" || lower === "set_stock_level") {
        return "Set Stock Level";
    }
    return null;
}

/**
 * POST /api/inventory/adjustments
 * Performs controlled stock adjustments (increase/decrease/set).
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
        const rawType = body.adjustmentType || body.type;
        const quantity = parseInt(body.quantity, 10);
        const reason = String(body.reason || "").trim();

        if (!productId) {
            return Response.json(
                { success: false, message: "Product ID is required." },
                { status: 400 }
            );
        }

        const adjustmentType = normalizeAdjustmentType(rawType);
        if (!adjustmentType) {
            return Response.json(
                { success: false, message: "Invalid adjustment type. Supported types: 'increase', 'decrease', or 'Set Stock Level'." },
                { status: 400 }
            );
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            return Response.json(
                { success: false, message: "Quantity must be a positive integer greater than zero." },
                { status: 400 }
            );
        }

        if (!reason) {
            return Response.json(
                { success: false, message: "Adjustment reason is required." },
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

        // Enforce store scoping if user is assigned to a specific store
        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            if (storeId && storeId !== userStoreId) {
                return Response.json(
                    { success: false, message: "You are not authorized to adjust stock for this store." },
                    { status: 403 }
                );
            }
            storeId = userStoreId;
        }

        // Validate product
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

        if (!storeId) {
            storeId = product.store_id;
        }

        // Validate store
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

        // Check current stock for Decrease / Remove Stock
        const { data: currentInv } = await admin
            .from("inventory")
            .select("current_stock")
            .eq("product_id", productId)
            .eq("store_id", storeId)
            .maybeSingle();

        const currentStock = currentInv ? Number(currentInv.current_stock ?? 0) : 0;

        if (adjustmentType === "Remove Stock" && currentStock < quantity) {
            return Response.json(
                {
                    success: false,
                    message: `Insufficient stock: only ${currentStock} units available, cannot decrease by ${quantity}.`,
                },
                { status: 400 }
            );
        }

        // Insert stock movement record (trigger apply_stock_movement handles atomic inventory lock & update)
        const movementPayload = {
            store_id: storeId,
            product_id: productId,
            adjustment_type: adjustmentType,
            reason: reason,
            notes: reason,
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
                { success: false, message: `Failed to apply stock adjustment: ${movError.message}` },
                { status: 500 }
            );
        }

        // Retrieve final updated inventory
        const { data: updatedInv } = await admin
            .from("inventory")
            .select("id, current_stock, reserved_stock, updated_at")
            .eq("product_id", productId)
            .eq("store_id", storeId)
            .maybeSingle();

        const resultingStock = updatedInv ? Number(updatedInv.current_stock ?? 0) : movement.quantity_after;

        return Response.json({
            success: true,
            message: `Stock successfully adjusted for "${product.name}".`,
            data: {
                productId: product.id,
                productName: product.name,
                sku: product.sku,
                storeId,
                storeName: storeData.name,
                adjustmentType,
                quantity,
                previousStock: movement?.quantity_before ?? currentStock,
                resultingStock,
                currentStock: resultingStock,
                stock: resultingStock,
                movementId: movement?.id,
                updatedAt: updatedInv?.updated_at || new Date().toISOString(),
            },
        });
    } catch (err) {
        return Response.json(
            { success: false, message: "An unexpected error occurred while processing stock adjustment." },
            { status: 500 }
        );
    }
}

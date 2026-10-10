import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission, hasRole } from "../../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

function getInventoryStatus(stock, reorderLevel) {
    if (stock <= 0) return "Out of Stock";
    if (stock <= (reorderLevel || 0)) return "Low Stock";
    return "In Stock";
}

/**
 * GET /api/inventory/[productId]
 * Retrieves stock details of a specific product by authorized store.
 */
export async function GET(request, context) {
    try {
        const params = await context.params;
        const productId = params?.productId;

        if (!productId) {
            return Response.json(
                { success: false, message: "Product ID is required." },
                { status: 400 }
            );
        }

        const auth = await requireAuthAndPermission(request, ["inventory.view", "inventory.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return Response.json(
                { success: false, message: "Server database configuration is missing." },
                { status: 503 }
            );
        }

        const admin = getSupabaseAdmin();

        let query = admin
            .from("products")
            .select(`
                id, store_id, sku, barcode, name, description, unit_of_measure,
                purchase_price, selling_price, reorder_level, status, updated_at,
                category:categories(id, name),
                supplier:suppliers(id, name),
                inventory(id, store_id, current_stock, reserved_stock, updated_at),
                store:stores(id, name)
            `)
            .eq("id", productId);

        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            query = query.eq("store_id", userStoreId);
        }

        const { data: product, error } = await query.maybeSingle();

        if (error) {
            return Response.json(
                { success: false, message: `Failed to query product stock: ${error.message}` },
                { status: 500 }
            );
        }

        if (!product) {
            return Response.json(
                { success: false, message: "Product not found or not accessible for your store." },
                { status: 404 }
            );
        }

        const inv = Array.isArray(product.inventory) && product.inventory[0] ? product.inventory[0] : null;
        const currentStock = inv ? Number(inv.current_stock ?? 0) : 0;
        const reservedStock = inv ? Number(inv.reserved_stock ?? 0) : 0;
        const reorderLevel = Number(product.reorder_level ?? 0);
        const storeObj = product.store && typeof product.store === "object" ? product.store : null;

        const canViewCostPrice = hasRole(auth.user, ["Admin", "Manager"]) ||
            auth.user?.permissions?.includes("inventory.manage") ||
            auth.user?.permissions?.includes("inventory.adjust");

        const data = {
            id: inv ? inv.id : `inv-${product.id}`,
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            barcode: product.barcode || "",
            unitOfMeasure: product.unit_of_measure || "PCS",
            storeId: product.store_id,
            storeName: storeObj ? storeObj.name : "Main Store",
            currentStock,
            stock: currentStock,
            reservedStock,
            reorderLevel,
            sellingPrice: Number(product.selling_price ?? 0),
            status: getInventoryStatus(currentStock, reorderLevel),
            updatedAt: inv?.updated_at || product.updated_at,
        };

        if (canViewCostPrice) {
            data.purchasePrice = Number(product.purchase_price ?? 0);
            data.costPrice = Number(product.purchase_price ?? 0);
            data.stockValue = Number((currentStock * Number(product.purchase_price ?? 0)).toFixed(2));
        }

        return Response.json({
            success: true,
            data,
        });
    } catch (err) {
        return Response.json(
            { success: false, message: "An unexpected error occurred while fetching product stock details." },
            { status: 500 }
        );
    }
}

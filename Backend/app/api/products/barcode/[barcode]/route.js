import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../../lib/supabase/admin.js";
import { requireAuthAndPermission, hasRole } from "../../../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

function formatProduct(p, canViewCostPrice = false) {
    const currentStock = Array.isArray(p.inventory) && p.inventory[0]
        ? Number(p.inventory[0].current_stock ?? 0)
        : 0;

    const categoryObj = p.category && typeof p.category === "object" ? p.category : null;
    const supplierObj = p.supplier && typeof p.supplier === "object" ? p.supplier : null;

    const isActive = p.status === "Active";

    const formatted = {
        id: p.id,
        storeId: p.store_id,
        sku: p.sku,
        barcode: p.barcode || "",
        name: p.name,
        description: p.description || "",
        categoryId: p.category_id || (categoryObj ? categoryObj.id : null),
        category: categoryObj ? categoryObj.name : (p.category_name || ""),
        supplierId: p.supplier_id || (supplierObj ? supplierObj.id : null),
        supplier: supplierObj ? supplierObj.name : (p.supplier_name || ""),
        sellingPrice: Number(p.selling_price ?? 0),
        price: Number(p.selling_price ?? 0),
        taxRate: Number(p.tax_rate ?? 0),
        reorderLevel: Number(p.reorder_level ?? 0),
        stock: currentStock,
        unitOfMeasure: p.unit_of_measure || "PCS",
        status: p.status,
        isActive,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
    };

    if (canViewCostPrice) {
        formatted.costPrice = Number(p.purchase_price ?? 0);
        formatted.purchasePrice = Number(p.purchase_price ?? 0);
    }

    return formatted;
}

/**
 * GET /api/products/barcode/[barcode]
 * Looks up a single product by exact barcode match.
 *
 * Requirements:
 *  - Authentication required.
 *  - products.view, products.manage, or pos.use permission required.
 *  - Scoped to user's store.
 *  - Exact barcode matching (preserves leading zeros and alphanumeric formats).
 *  - For POS sales selection, returns only active products. Inactive products return 400.
 *  - Conceals cost price from unauthorized cashiers.
 *  - Returns controlled 404 when product is not found.
 */
export async function GET(request, context) {
    try {
        const params = await context.params;
        const rawBarcode = params?.barcode;

        if (!rawBarcode) {
            return Response.json(
                { success: false, message: "Barcode parameter is required." },
                { status: 400 }
            );
        }

        const barcode = decodeURIComponent(String(rawBarcode).trim());
        if (!barcode) {
            return Response.json(
                { success: false, message: "Barcode cannot be empty." },
                { status: 400 }
            );
        }

        // Cashiers with pos.use or users with products.view/products.manage are authorized
        const auth = await requireAuthAndPermission(request, [
            "products.view",
            "products.manage",
            "pos.use",
        ]);
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
                id, store_id, category_id, supplier_id, sku, barcode, name, description,
                purchase_price, selling_price, tax_rate, reorder_level, unit_of_measure,
                status, created_at, updated_at,
                category:categories(id, name, code, status),
                supplier:suppliers(id, name, code, status),
                inventory(current_stock, reserved_stock)
            `)
            .eq("barcode", barcode);

        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            query = query.eq("store_id", userStoreId);
        }

        const { data: product, error } = await query.maybeSingle();

        if (error) {
            return Response.json(
                { success: false, message: `Failed to query product by barcode: ${error.message}` },
                { status: 500 }
            );
        }

        if (!product) {
            return Response.json(
                { success: false, message: `No product found with barcode "${barcode}".` },
                { status: 404 }
            );
        }

        // Cost price visibility: only Admin, Manager, or users with products.update/manage
        const canViewCostPrice = hasRole(auth.user, ["Admin", "Manager"]) ||
            auth.user?.permissions?.includes("products.update") ||
            auth.user?.permissions?.includes("products.manage");

        // Reject inactive products for POS sales selection
        if (product.status === "Inactive") {
            return Response.json(
                {
                    success: false,
                    message: `Product "${product.name}" is inactive and cannot be selected for sales.`,
                    data: formatProduct(product, canViewCostPrice),
                },
                { status: 400 }
            );
        }

        return Response.json({
            success: true,
            data: formatProduct(product, canViewCostPrice),
        });
    } catch (err) {
        return Response.json(
            { success: false, message: "An unexpected error occurred during barcode lookup." },
            { status: 500 }
        );
    }
}

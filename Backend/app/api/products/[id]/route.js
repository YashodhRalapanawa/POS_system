import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission, hasRole } from "../../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

const VALID_UOMS = [
    "PCS",
    "UNIT",
    "BOX",
    "PACK",
    "KG",
    "G",
    "L",
    "ML",
    "BOTTLE",
    "CAN",
    "SET",
    "PAIR",
    "M",
    "CM",
    "ROLL",
    "DOZEN",
];

function normalizeSku(sku) {
    return String(sku || "").trim().toUpperCase();
}

function normalizeBarcode(barcode) {
    const trimmed = String(barcode || "").trim();
    return trimmed || null;
}

function normalizeUom(uom) {
    const val = String(uom || "PCS").trim().toUpperCase();
    return VALID_UOMS.includes(val) ? val : "PCS";
}

function formatProduct(p, canViewCostPrice = true) {
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
 * GET /api/products/[id]
 * Retrieves details of a specific product.
 */
export async function GET(request, context) {
    try {
        const { id } = await context.params;
        if (!id) {
            return Response.json(
                { success: false, message: "Product ID is required." },
                { status: 400 }
            );
        }

        const auth = await requireAuthAndPermission(request, ["products.view", "products.manage"]);
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
            .eq("id", id);

        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            query = query.eq("store_id", userStoreId);
        }

        const { data: product, error } = await query.maybeSingle();

        if (error) {
            return Response.json(
                { success: false, message: `Failed to retrieve product: ${error.message}` },
                { status: 500 }
            );
        }

        if (!product) {
            return Response.json(
                { success: false, message: "Product not found." },
                { status: 404 }
            );
        }

        // Only authorized roles / users see cost price
        const canViewCostPrice = hasRole(auth.user, ["Admin", "Manager"]) ||
            auth.user?.permissions?.includes("products.update") ||
            auth.user?.permissions?.includes("products.manage");

        return Response.json({
            success: true,
            data: formatProduct(product, canViewCostPrice),
        });
    } catch (err) {
        return Response.json(
            { success: false, message: "An unexpected error occurred while fetching product details." },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/products/[id]
 * Updates product information or toggles active status.
 */
export async function PATCH(request, context) {
    try {
        const { id } = await context.params;
        if (!id) {
            return Response.json(
                { success: false, message: "Product ID is required." },
                { status: 400 }
            );
        }

        const auth = await requireAuthAndPermission(request, ["products.update", "products.manage"]);
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

        if (!isSupabaseAdminConfigured()) {
            return Response.json(
                { success: false, message: "Server database configuration is missing." },
                { status: 503 }
            );
        }

        const admin = getSupabaseAdmin();

        // 1. Fetch current product to ensure existence and store scoping
        let fetchQuery = admin
            .from("products")
            .select("id, store_id, sku, barcode, category_id, supplier_id, status")
            .eq("id", id);

        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            fetchQuery = fetchQuery.eq("store_id", userStoreId);
        }

        const { data: currentProduct, error: fetchError } = await fetchQuery.maybeSingle();

        if (fetchError) {
            return Response.json(
                { success: false, message: `Failed to load product: ${fetchError.message}` },
                { status: 500 }
            );
        }

        if (!currentProduct) {
            return Response.json(
                { success: false, message: "Product not found." },
                { status: 404 }
            );
        }

        const updates = {
            updated_at: new Date().toISOString(),
        };

        // Name
        if (body.name !== undefined) {
            const name = String(body.name).trim();
            if (!name) {
                return Response.json(
                    { success: false, message: "Product Name cannot be empty." },
                    { status: 400 }
                );
            }
            updates.name = name;
        }

        // SKU
        if (body.sku !== undefined) {
            const sku = normalizeSku(body.sku);
            if (!sku) {
                return Response.json(
                    { success: false, message: "Product SKU cannot be empty." },
                    { status: 400 }
                );
            }
            if (sku !== currentProduct.sku) {
                const { data: duplicateSku } = await admin
                    .from("products")
                    .select("id")
                    .eq("store_id", currentProduct.store_id)
                    .ilike("sku", sku)
                    .neq("id", id)
                    .maybeSingle();

                if (duplicateSku) {
                    return Response.json(
                        { success: false, message: `A product with SKU "${sku}" already exists in this store.` },
                        { status: 400 }
                    );
                }
            }
            updates.sku = sku;
        }

        // Barcode
        if (body.barcode !== undefined) {
            const barcode = normalizeBarcode(body.barcode);
            if (barcode && barcode !== currentProduct.barcode) {
                const { data: duplicateBarcode } = await admin
                    .from("products")
                    .select("id")
                    .eq("store_id", currentProduct.store_id)
                    .eq("barcode", barcode)
                    .neq("id", id)
                    .maybeSingle();

                if (duplicateBarcode) {
                    return Response.json(
                        { success: false, message: `A product with barcode "${barcode}" already exists in this store.` },
                        { status: 400 }
                    );
                }
            }
            updates.barcode = barcode;
        }

        // Description
        if (body.description !== undefined) {
            updates.description = String(body.description || "").trim();
        }

        // Unit of Measure
        if (body.unitOfMeasure !== undefined || body.uom !== undefined) {
            updates.unit_of_measure = normalizeUom(body.unitOfMeasure || body.uom);
        }

        // Selling Price
        if (body.sellingPrice !== undefined || body.selling_price !== undefined) {
            const sp = Number(body.sellingPrice ?? body.selling_price);
            if (!Number.isFinite(sp) || sp < 0) {
                return Response.json(
                    { success: false, message: "Selling Price cannot be negative." },
                    { status: 400 }
                );
            }
            updates.selling_price = sp;
        }

        // Cost Price / Purchase Price
        if (body.costPrice !== undefined || body.purchasePrice !== undefined || body.purchase_price !== undefined) {
            const cp = Number(body.costPrice ?? body.purchasePrice ?? body.purchase_price);
            if (!Number.isFinite(cp) || cp < 0) {
                return Response.json(
                    { success: false, message: "Cost Price cannot be negative." },
                    { status: 400 }
                );
            }
            updates.purchase_price = cp;
        }

        // Tax Rate
        if (body.taxRate !== undefined || body.tax_rate !== undefined) {
            const tr = Number(body.taxRate ?? body.tax_rate);
            if (!Number.isFinite(tr) || tr < 0 || tr > 100) {
                return Response.json(
                    { success: false, message: "Tax Rate must be between 0 and 100." },
                    { status: 400 }
                );
            }
            updates.tax_rate = tr;
        }

        // Reorder Level
        if (body.reorderLevel !== undefined || body.reorder_level !== undefined) {
            const rl = Math.max(0, parseInt(body.reorderLevel ?? body.reorder_level, 10) || 0);
            updates.reorder_level = rl;
        }

        // Active / Inactive status
        if (body.isActive !== undefined) {
            updates.status = body.isActive ? "Active" : "Inactive";
        } else if (body.status !== undefined) {
            if (body.status === "Active" || body.status === "Inactive") {
                updates.status = body.status;
            } else {
                return Response.json(
                    { success: false, message: "Status must be either 'Active' or 'Inactive'." },
                    { status: 400 }
                );
            }
        }

        // Category validation if changed
        if (body.categoryId !== undefined || body.category_id !== undefined || body.category !== undefined) {
            const catId = body.categoryId ?? body.category_id;
            if (catId) {
                const { data: catData, error: catError } = await admin
                    .from("categories")
                    .select("id, name, status")
                    .eq("id", catId)
                    .maybeSingle();

                if (catError || !catData) {
                    return Response.json(
                        { success: false, message: "Selected category does not exist." },
                        { status: 400 }
                    );
                }

                // If changing category to a new category, ensure it's active
                if (catId !== currentProduct.category_id && catData.status === "Inactive") {
                    return Response.json(
                        { success: false, message: "Cannot assign an inactive category." },
                        { status: 400 }
                    );
                }
                updates.category_id = catId;
            } else if (typeof body.category === "string" && body.category.trim()) {
                const { data: catByName } = await admin
                    .from("categories")
                    .select("id, name, status")
                    .eq("store_id", currentProduct.store_id)
                    .ilike("name", body.category.trim())
                    .maybeSingle();

                if (catByName) {
                    if (catByName.id !== currentProduct.category_id && catByName.status === "Inactive") {
                        return Response.json(
                            { success: false, message: "Cannot assign an inactive category." },
                            { status: 400 }
                        );
                    }
                    updates.category_id = catByName.id;
                }
            } else if (body.categoryId === null || body.category === "") {
                updates.category_id = null;
            }
        }

        // Supplier validation if changed
        if (body.supplierId !== undefined || body.supplier_id !== undefined || body.supplier !== undefined) {
            const supId = body.supplierId ?? body.supplier_id;
            if (supId) {
                const { data: supData, error: supError } = await admin
                    .from("suppliers")
                    .select("id, name, status")
                    .eq("id", supId)
                    .maybeSingle();

                if (supError || !supData) {
                    return Response.json(
                        { success: false, message: "Selected supplier does not exist." },
                        { status: 400 }
                    );
                }

                // If changing supplier to a new supplier, ensure it's active
                if (supId !== currentProduct.supplier_id && supData.status === "Inactive") {
                    return Response.json(
                        { success: false, message: "Cannot assign an inactive supplier." },
                        { status: 400 }
                    );
                }
                updates.supplier_id = supId;
            } else if (typeof body.supplier === "string" && body.supplier.trim()) {
                const { data: supByName } = await admin
                    .from("suppliers")
                    .select("id, name, status")
                    .eq("store_id", currentProduct.store_id)
                    .ilike("name", body.supplier.trim())
                    .maybeSingle();

                if (supByName) {
                    if (supByName.id !== currentProduct.supplier_id && supByName.status === "Inactive") {
                        return Response.json(
                            { success: false, message: "Cannot assign an inactive supplier." },
                            { status: 400 }
                        );
                    }
                    updates.supplier_id = supByName.id;
                }
            } else if (body.supplierId === null || body.supplier === "") {
                updates.supplier_id = null;
            }
        }

        // Save updates
        const { data: updatedProduct, error: updateError } = await admin
            .from("products")
            .update(updates)
            .eq("id", id)
            .select(`
                id, store_id, category_id, supplier_id, sku, barcode, name, description,
                purchase_price, selling_price, tax_rate, reorder_level, unit_of_measure,
                status, created_at, updated_at,
                category:categories(id, name, code, status),
                supplier:suppliers(id, name, code, status),
                inventory(current_stock, reserved_stock)
            `)
            .single();

        if (updateError) {
            return Response.json(
                { success: false, message: `Failed to update product: ${updateError.message}` },
                { status: 500 }
            );
        }

        return Response.json({
            success: true,
            message: "Product updated successfully",
            data: formatProduct(updatedProduct),
        });
    } catch (err) {
        return Response.json(
            { success: false, message: "An unexpected error occurred while updating product." },
            { status: 500 }
        );
    }
}

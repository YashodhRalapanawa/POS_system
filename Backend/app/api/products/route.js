import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";

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

function formatProduct(p) {
    const currentStock = Array.isArray(p.inventory) && p.inventory[0]
        ? Number(p.inventory[0].current_stock ?? 0)
        : 0;

    const categoryObj = p.category && typeof p.category === "object" ? p.category : null;
    const supplierObj = p.supplier && typeof p.supplier === "object" ? p.supplier : null;

    const isActive = p.status === "Active";

    return {
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
        costPrice: Number(p.purchase_price ?? 0),
        purchasePrice: Number(p.purchase_price ?? 0),
        taxRate: Number(p.tax_rate ?? 0),
        reorderLevel: Number(p.reorder_level ?? 0),
        stock: currentStock,
        unitOfMeasure: p.unit_of_measure || "PCS",
        status: p.status,
        isActive,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
    };
}

/**
 * GET /api/products
 * Retrieves product records with category, supplier, and stock information.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["products.view", "products.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const url = new URL(request.url);
        const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
        const categoryFilter = (url.searchParams.get("category") || url.searchParams.get("categoryId") || "").trim();
        const supplierFilter = (url.searchParams.get("supplier") || url.searchParams.get("supplierId") || "").trim();
        const statusFilter = (url.searchParams.get("status") || "").trim();
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
            .from("products")
            .select(`
                id, store_id, category_id, supplier_id, sku, barcode, name, description,
                purchase_price, selling_price, tax_rate, reorder_level, unit_of_measure,
                status, created_at, updated_at,
                category:categories(id, name, code, status),
                supplier:suppliers(id, name, code, status),
                inventory(current_stock, reserved_stock)
            `, { count: "exact" });

        // Status filter
        if (statusFilter && statusFilter !== "All Status" && statusFilter !== "All Stock Status" && statusFilter !== "All") {
            if (statusFilter === "Active" || statusFilter === "Inactive") {
                query = query.eq("status", statusFilter);
            }
        }

        // Search filter (name, sku, barcode)
        if (search) {
            const cleanSearch = search.replace(/[%_,]/g, "");
            if (cleanSearch) {
                query = query.or(
                    `name.ilike.%${cleanSearch}%,sku.ilike.%${cleanSearch}%,barcode.ilike.%${cleanSearch}%`
                );
            }
        }

        // Category filter (by UUID or name)
        if (categoryFilter && categoryFilter !== "All Categories" && categoryFilter !== "All") {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryFilter);
            if (isUuid) {
                query = query.eq("category_id", categoryFilter);
            }
        }

        // Supplier filter (by UUID or name)
        if (supplierFilter && supplierFilter !== "All Suppliers" && supplierFilter !== "All") {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplierFilter);
            if (isUuid) {
                query = query.eq("supplier_id", supplierFilter);
            }
        }

        // Store scoping
        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            query = query.eq("store_id", userStoreId);
        }

        query = query.order("name", { ascending: true }).range(offset, offset + limit - 1);

        const { data: products, count, error } = await query;

        if (error) {
            return Response.json(
                { success: false, message: `Failed to retrieve products: ${error.message}` },
                { status: 500 }
            );
        }

        let formatted = (products || []).map(formatProduct);

        // In-memory filter for category name or supplier name if non-UUID filter was passed
        if (categoryFilter && categoryFilter !== "All Categories" && categoryFilter !== "All") {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryFilter);
            if (!isUuid) {
                formatted = formatted.filter((p) => p.category?.toLowerCase() === categoryFilter.toLowerCase());
            }
        }

        if (supplierFilter && supplierFilter !== "All Suppliers" && supplierFilter !== "All") {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplierFilter);
            if (!isUuid) {
                formatted = formatted.filter((p) => p.supplier?.toLowerCase() === supplierFilter.toLowerCase());
            }
        }

        const total = count ?? formatted.length;
        const totalPages = Math.ceil(total / limit) || 1;

        return Response.json({
            success: true,
            data: {
                products: formatted,
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
            { success: false, message: "An unexpected error occurred while fetching products." },
            { status: 500 }
        );
    }
}

/**
 * POST /api/products
 * Creates a new product record.
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["products.create", "products.manage"]);
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

        const name = String(body.name || "").trim();
        const sku = normalizeSku(body.sku);
        const barcode = normalizeBarcode(body.barcode);
        const description = String(body.description || "").trim();
        const unitOfMeasure = normalizeUom(body.unitOfMeasure || body.uom);

        // Required field validations
        if (!name) {
            return Response.json(
                { success: false, message: "Product Name is required." },
                { status: 400 }
            );
        }

        if (!sku) {
            return Response.json(
                { success: false, message: "Product SKU / Code is required." },
                { status: 400 }
            );
        }

        // Pricing validations
        const sellingPrice = Number(body.sellingPrice ?? body.selling_price);
        if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
            return Response.json(
                { success: false, message: "Selling Price cannot be negative." },
                { status: 400 }
            );
        }

        const costPrice = Number(body.costPrice ?? body.purchasePrice ?? body.purchase_price ?? 0);
        if (!Number.isFinite(costPrice) || costPrice < 0) {
            return Response.json(
                { success: false, message: "Cost Price cannot be negative." },
                { status: 400 }
            );
        }

        const taxRate = Number(body.taxRate ?? body.tax_rate ?? 0);
        if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
            return Response.json(
                { success: false, message: "Tax Rate must be between 0 and 100." },
                { status: 400 }
            );
        }

        const reorderLevel = Math.max(0, parseInt(body.reorderLevel ?? body.reorder_level ?? 0, 10) || 0);

        const isActive = body.isActive !== undefined
            ? Boolean(body.isActive)
            : body.status !== "Inactive";
        const status = isActive ? "Active" : "Inactive";

        if (!isSupabaseAdminConfigured()) {
            return Response.json(
                { success: false, message: "Server database configuration is missing." },
                { status: 503 }
            );
        }

        const admin = getSupabaseAdmin();

        // Determine target store
        let storeId = auth.user?.storeId || auth.user?.store_id;
        if (!storeId) {
            const { data: storeData } = await admin
                .from("stores")
                .select("id")
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();

            if (storeData) {
                storeId = storeData.id;
            } else {
                return Response.json(
                    { success: false, message: "Cannot associate product: No store found." },
                    { status: 400 }
                );
            }
        }

        // Check duplicate SKU in this store
        const { data: existingSku } = await admin
            .from("products")
            .select("id")
            .eq("store_id", storeId)
            .ilike("sku", sku)
            .maybeSingle();

        if (existingSku) {
            return Response.json(
                { success: false, message: `A product with SKU "${sku}" already exists in this store.` },
                { status: 400 }
            );
        }

        // Check duplicate barcode if barcode provided
        if (barcode) {
            const { data: existingBarcode } = await admin
                .from("products")
                .select("id")
                .eq("store_id", storeId)
                .eq("barcode", barcode)
                .maybeSingle();

            if (existingBarcode) {
                return Response.json(
                    { success: false, message: `A product with barcode "${barcode}" already exists in this store.` },
                    { status: 400 }
                );
            }
        }

        // Validate category relationship and reject inactive category for new assignments
        let categoryId = body.categoryId || body.category_id || null;
        if (categoryId) {
            const { data: catData, error: catError } = await admin
                .from("categories")
                .select("id, name, status")
                .eq("id", categoryId)
                .maybeSingle();

            if (catError || !catData) {
                return Response.json(
                    { success: false, message: "Selected category does not exist." },
                    { status: 400 }
                );
            }

            if (catData.status === "Inactive") {
                return Response.json(
                    { success: false, message: "Cannot assign an inactive category to a new product." },
                    { status: 400 }
                );
            }
        } else if (body.category && typeof body.category === "string") {
            // Find category by name
            const { data: catByName } = await admin
                .from("categories")
                .select("id, name, status")
                .eq("store_id", storeId)
                .ilike("name", body.category.trim())
                .maybeSingle();

            if (catByName) {
                if (catByName.status === "Inactive") {
                    return Response.json(
                        { success: false, message: "Cannot assign an inactive category to a new product." },
                        { status: 400 }
                    );
                }
                categoryId = catByName.id;
            }
        }

        // Validate supplier relationship and reject inactive supplier for new assignments
        let supplierId = body.supplierId || body.supplier_id || null;
        if (supplierId) {
            const { data: supData, error: supError } = await admin
                .from("suppliers")
                .select("id, name, status")
                .eq("id", supplierId)
                .maybeSingle();

            if (supError || !supData) {
                return Response.json(
                    { success: false, message: "Selected supplier does not exist." },
                    { status: 400 }
                );
            }

            if (supData.status === "Inactive") {
                return Response.json(
                    { success: false, message: "Cannot assign an inactive supplier to a new product." },
                    { status: 400 }
                );
            }
        } else if (body.supplier && typeof body.supplier === "string") {
            // Find supplier by name
            const { data: supByName } = await admin
                .from("suppliers")
                .select("id, name, status")
                .eq("store_id", storeId)
                .ilike("name", body.supplier.trim())
                .maybeSingle();

            if (supByName) {
                if (supByName.status === "Inactive") {
                    return Response.json(
                        { success: false, message: "Cannot assign an inactive supplier to a new product." },
                        { status: 400 }
                    );
                }
                supplierId = supByName.id;
            }
        }

        // Insert into products table
        const insertPayload = {
            store_id: storeId,
            category_id: categoryId,
            supplier_id: supplierId,
            sku,
            barcode,
            name,
            description,
            purchase_price: costPrice,
            selling_price: sellingPrice,
            tax_rate: taxRate,
            reorder_level: reorderLevel,
            unit_of_measure: unitOfMeasure,
            status,
        };

        const { data: createdProduct, error: insertError } = await admin
            .from("products")
            .insert(insertPayload)
            .select(`
                id, store_id, category_id, supplier_id, sku, barcode, name, description,
                purchase_price, selling_price, tax_rate, reorder_level, unit_of_measure,
                status, created_at, updated_at,
                category:categories(id, name, code, status),
                supplier:suppliers(id, name, code, status),
                inventory(current_stock, reserved_stock)
            `)
            .single();

        if (insertError) {
            return Response.json(
                { success: false, message: `Failed to create product: ${insertError.message}` },
                { status: 500 }
            );
        }

        return Response.json(
            {
                success: true,
                message: "Product created successfully",
                data: formatProduct(createdProduct),
            },
            { status: 201 }
        );
    } catch (err) {
        return Response.json(
            { success: false, message: "An unexpected error occurred while creating product." },
            { status: 500 }
        );
    }
}

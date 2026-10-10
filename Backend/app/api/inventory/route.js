import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";
import { requireAuthAndPermission, hasRole } from "../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

function getInventoryStatus(stock, reorderLevel) {
    if (stock <= 0) return "Out of Stock";
    if (stock <= (reorderLevel || 0)) return "Low Stock";
    return "In Stock";
}

function formatInventoryItem(p, storeMap = {}, canViewCostPrice = true) {
    const inv = Array.isArray(p.inventory) && p.inventory[0] ? p.inventory[0] : null;
    const currentStock = inv ? Number(inv.current_stock ?? 0) : 0;
    const reservedStock = inv ? Number(inv.reserved_stock ?? 0) : 0;
    const reorderLevel = Number(p.reorder_level ?? 0);
    const categoryObj = p.category && typeof p.category === "object" ? p.category : null;
    const supplierObj = p.supplier && typeof p.supplier === "object" ? p.supplier : null;
    const storeObj = p.store && typeof p.store === "object" ? p.store : null;
    const storeId = p.store_id || (inv ? inv.store_id : null);
    const storeName = storeObj ? storeObj.name : (storeMap[storeId] || "Main Store");

    const item = {
        id: inv ? inv.id : `inv-${p.id}`,
        productId: p.id,
        productName: p.name,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode || "",
        unitOfMeasure: p.unit_of_measure || "PCS",
        categoryId: p.category_id,
        category: categoryObj ? categoryObj.name : "Unassigned",
        supplierId: p.supplier_id,
        supplier: supplierObj ? supplierObj.name : "Unassigned",
        storeId,
        storeName,
        store: storeName,
        stock: currentStock,
        currentStock,
        reservedStock,
        reorderLevel,
        sellingPrice: Number(p.selling_price ?? 0),
        status: getInventoryStatus(currentStock, reorderLevel),
        productStatus: p.status,
        isActive: p.status === "Active",
        updatedAt: inv?.updated_at || p.updated_at || new Date().toISOString(),
    };

    if (canViewCostPrice) {
        item.purchasePrice = Number(p.purchase_price ?? 0);
        item.costPrice = Number(p.purchase_price ?? 0);
        item.stockValue = Number((currentStock * Number(p.purchase_price ?? 0)).toFixed(2));
    }

    return item;
}

/**
 * GET /api/inventory
 * Retrieves stock balances with product, category, supplier, and store details.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["inventory.view", "inventory.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const url = new URL(request.url);
        const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
        const storeFilter = (url.searchParams.get("store") || url.searchParams.get("storeId") || "").trim();
        const categoryFilter = (url.searchParams.get("category") || url.searchParams.get("categoryId") || "").trim();
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

        // Load stores map for name resolution
        const { data: storesList } = await admin.from("stores").select("id, name");
        const storeMap = {};
        if (Array.isArray(storesList)) {
            storesList.forEach((s) => {
                storeMap[s.id] = s.name;
            });
        }

        // Base query from products with inventory left join
        let query = admin
            .from("products")
            .select(`
                id, store_id, sku, barcode, name, description, unit_of_measure,
                purchase_price, selling_price, reorder_level, status, updated_at,
                category:categories(id, name),
                supplier:suppliers(id, name),
                inventory(id, store_id, current_stock, reserved_stock, updated_at),
                store:stores(id, name)
            `, { count: "exact" });

        // Scoping by user store if authenticated user is assigned a specific store
        if (auth.user?.storeId || auth.user?.store_id) {
            const userStoreId = auth.user.storeId || auth.user.store_id;
            query = query.eq("store_id", userStoreId);
        } else if (storeFilter && storeFilter !== "All Stores" && storeFilter !== "All") {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeFilter);
            if (isUuid) {
                query = query.eq("store_id", storeFilter);
            }
        }

        // Search filter (product name, sku, barcode)
        if (search) {
            const cleanSearch = search.replace(/[%_,]/g, "");
            if (cleanSearch) {
                query = query.or(
                    `name.ilike.%${cleanSearch}%,sku.ilike.%${cleanSearch}%,barcode.ilike.%${cleanSearch}%`
                );
            }
        }

        // Category filter
        if (categoryFilter && categoryFilter !== "All Categories" && categoryFilter !== "All") {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryFilter);
            if (isUuid) {
                query = query.eq("category_id", categoryFilter);
            }
        }

        query = query.order("name", { ascending: true }).range(offset, offset + limit - 1);

        const { data: products, count, error } = await query;

        if (error) {
            return Response.json(
                { success: false, message: `Failed to retrieve inventory: ${error.message}` },
                { status: 500 }
            );
        }

        const canViewCostPrice = hasRole(auth.user, ["Admin", "Manager"]) ||
            auth.user?.permissions?.includes("inventory.manage") ||
            auth.user?.permissions?.includes("inventory.adjust");

        let formatted = (products || []).map((p) => formatInventoryItem(p, storeMap, canViewCostPrice));

        // Category name filter fallback if non-UUID was provided
        if (categoryFilter && categoryFilter !== "All Categories" && categoryFilter !== "All") {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryFilter);
            if (!isUuid) {
                formatted = formatted.filter((item) => item.category?.toLowerCase() === categoryFilter.toLowerCase());
            }
        }

        // Status filter in memory (In Stock, Low Stock, Out of Stock)
        if (statusFilter && statusFilter !== "All Status" && statusFilter !== "All") {
            formatted = formatted.filter((item) => item.status === statusFilter);
        }

        const total = count ?? formatted.length;
        const totalPages = Math.ceil(total / limit) || 1;

        return Response.json({
            success: true,
            data: {
                inventory: formatted,
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
            { success: false, message: "An unexpected error occurred while fetching inventory." },
            { status: 500 }
        );
    }
}

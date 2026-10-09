import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../lib/responses/index.js";

export const dynamic = "force-dynamic";

/**
 * Normalizes an order record and its related entities into consistent API response format.
 */
function formatOrderResponse(order, items = [], customer = null, cashier = null, store = null) {
    const cust = customer || order.customer || null;
    const cash = cashier || order.cashier || null;
    const str = store || order.store || null;

    const formattedItems = (items || order.order_items || order.items || []).map((it) => ({
        id: it.id,
        orderId: it.order_id || order.id,
        productId: it.product_id,
        productName: it.product_name || it.product?.name || "",
        sku: it.sku || it.product?.sku || "",
        quantity: Number(it.quantity || 1),
        unitPrice: Number(it.unit_price || 0),
        unitCost: Number(it.unit_cost || 0),
        lineSubtotal: Number(it.line_total || (Number(it.quantity || 1) * Number(it.unit_price || 0))),
        lineTotal: Number(it.line_total || (Number(it.quantity || 1) * Number(it.unit_price || 0))),
        createdAt: it.created_at || order.created_at,
    }));

    const itemCount = formattedItems.reduce((acc, curr) => acc + curr.quantity, 0);

    return {
        id: order.id,
        orderNumber: order.order_number,
        storeId: order.store_id,
        storeName: str?.name || "",
        storeCode: str?.code || "",
        store: str ? { id: str.id, name: str.name, code: str.code } : null,
        customerId: order.customer_id,
        customerName: cust?.name || "Walk-in Customer",
        customerCode: cust?.code || "",
        customerPhone: cust?.phone || "",
        customerEmail: cust?.email || "",
        isWalkIn: Boolean(cust?.is_walk_in),
        customer: cust ? {
            id: cust.id,
            name: cust.name,
            code: cust.code,
            phone: cust.phone || "",
            email: cust.email || "",
            isWalkIn: Boolean(cust.is_walk_in),
        } : null,
        cashierId: order.cashier_user_id,
        cashierName: cash?.full_name || cash?.username || "Cashier",
        cashierUsername: cash?.username || "",
        cashierEmployeeCode: cash?.employee_code || "",
        cashier: cash ? {
            id: cash.id,
            name: cash.full_name || cash.username || "Cashier",
            username: cash.username || "",
            employeeCode: cash.employee_code || "",
        } : null,
        status: String(order.status || "draft").toLowerCase(),
        currencyCode: order.currency_code || order.currency || "USD",
        currency: order.currency_code || order.currency || "USD",
        subtotal: Number(order.subtotal || 0),
        totalAmount: Number(order.total_amount || order.subtotal || 0),
        total: Number(order.total_amount || order.subtotal || 0),
        notes: order.notes || "",
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        completedAt: order.completed_at || null,
        completedBy: order.completed_by || null,
        itemCount,
        items: formattedItems,
    };
}

/**
 * POST /api/pos/orders
 * Creates a new draft POS order atomically without deducting stock.
 *
 * Requirements:
 *  - Require authentication & pos_orders.create permission
 *  - Cashier is recorded from authenticated session (never trusted from frontend)
 *  - Verify cashier has access to the target store
 *  - Validate customer ID (or resolve default walk-in customer)
 *  - Validate product IDs and reject inactive products
 *  - Validate positive integer quantities
 *  - Resolve selling prices strictly from backend products catalog
 *  - Calculate draft order subtotal and total accurately
 *  - Generate unique order number on backend
 *  - Save order header and items atomically
 *  - Support idempotency to prevent duplicate submissions
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "pos_orders.create",
            "pos.use",
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

        const cashierId = auth.user.id;
        const authUserStoreId = auth.user.storeId || auth.user.store_id;

        // Verify store access: cashiers can only place orders in their assigned store
        const requestedStoreId = body.storeId || body.store_id || authUserStoreId;
        if (!requestedStoreId) {
            return errorResponse("Store ID is required.", 400);
        }

        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        if (authUserStoreId && requestedStoreId !== authUserStoreId && !isAdmin) {
            return errorResponse("You do not have access to the selected store.", 403);
        }

        const storeId = requestedStoreId;

        // Idempotency key from header or body
        const idempotencyKey = (
            request.headers.get("idempotency-key") ||
            body.idempotencyKey ||
            body.idempotency_key ||
            ""
        ).trim() || null;

        const admin = getSupabaseAdmin();

        // Check idempotency if key provided
        if (idempotencyKey) {
            const { data: existingOrder } = await admin
                .from("orders")
                .select(`
                    id, order_number, store_id, customer_id, cashier_user_id,
                    status, subtotal, total_amount, notes, created_at, updated_at,
                    customer:customers (id, name, code, phone, email, is_walk_in),
                    cashier:users (id, full_name, username, employee_code),
                    store:stores (id, name, code),
                    order_items (id, order_id, product_id, product_name, sku, quantity, unit_price, unit_cost, line_total, created_at)
                `)
                .eq("store_id", storeId)
                .eq("idempotency_key", idempotencyKey)
                .maybeSingle();

            if (existingOrder) {
                return successResponse(
                    {
                        order: formatOrderResponse(
                            existingOrder,
                            existingOrder.order_items,
                            existingOrder.customer,
                            existingOrder.cashier,
                            existingOrder.store
                        ),
                        isDuplicate: true,
                    },
                    "Draft order already saved (idempotent submission)",
                    200
                );
            }
        }

        // Validate items
        const rawItems = Array.isArray(body.items) ? body.items : [];
        if (rawItems.length === 0) {
            return errorResponse("Add at least one item to save a draft order.", 400);
        }

        const cleanedItems = [];
        for (const item of rawItems) {
            const productId = item.productId || item.product_id;
            const quantity = parseInt(item.quantity, 10);

            if (!productId) {
                return errorResponse("Product ID is required for each cart item.", 400);
            }
            if (!Number.isInteger(quantity) || quantity <= 0) {
                return errorResponse("Item quantities must be positive integers.", 400);
            }
            cleanedItems.push({ productId, quantity });
        }

        // Resolve / validate customer
        let customerId = body.customerId || body.customer_id || null;
        let customerRecord = null;

        if (customerId) {
            const { data: cust, error: custErr } = await admin
                .from("customers")
                .select("id, name, code, phone, email, is_walk_in, status")
                .eq("id", customerId)
                .eq("store_id", storeId)
                .maybeSingle();

            if (custErr || !cust) {
                return errorResponse("Selected customer was not found in this store.", 400);
            }
            if (cust.status !== "Active") {
                return errorResponse("Selected customer is inactive.", 400);
            }
            customerRecord = cust;
        } else {
            // Default walk-in customer for the store
            const { data: walkIn } = await admin
                .from("customers")
                .select("id, name, code, phone, email, is_walk_in, status")
                .eq("store_id", storeId)
                .eq("is_walk_in", true)
                .maybeSingle();

            if (walkIn) {
                customerId = walkIn.id;
                customerRecord = walkIn;
            } else {
                // Fallback to first customer created for the store
                const { data: firstCust } = await admin
                    .from("customers")
                    .select("id, name, code, phone, email, is_walk_in, status")
                    .eq("store_id", storeId)
                    .order("created_at", { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (firstCust) {
                    customerId = firstCust.id;
                    customerRecord = firstCust;
                }
            }
        }

        // Validate products and fetch authoritative selling prices from Supabase
        const productIds = cleanedItems.map((it) => it.productId);
        const { data: products, error: prodErr } = await admin
            .from("products")
            .select("id, name, sku, selling_price, purchase_price, tax_rate, status")
            .eq("store_id", storeId)
            .in("id", productIds);

        if (prodErr || !products) {
            return errorResponse("Failed to validate products.", 500);
        }

        const productMap = new Map();
        for (const p of products) {
            productMap.set(p.id, p);
        }

        for (const item of cleanedItems) {
            const product = productMap.get(item.productId);
            if (!product) {
                return errorResponse(`Product with ID ${item.productId} was not found in this store.`, 400);
            }
            if (product.status !== "Active") {
                return errorResponse(`Product "${product.name}" is inactive and cannot be ordered.`, 400);
            }
        }

        // Authoritative stock validation for all submitted order items (Task 19)
        const { data: storeSetting } = await admin
            .from("store_settings")
            .select("allow_negative_stock, currency, currency_code")
            .eq("store_id", storeId)
            .maybeSingle();

        const allowNegativeStock = Boolean(storeSetting?.allow_negative_stock);
        const storeCurrency = storeSetting?.currency_code || storeSetting?.currency || "USD";

        // Aggregate quantities across duplicate product lines
        const aggregatedQuantities = new Map();
        for (const it of cleanedItems) {
            aggregatedQuantities.set(it.productId, (aggregatedQuantities.get(it.productId) || 0) + it.quantity);
        }

        const uniqueProductIds = Array.from(aggregatedQuantities.keys());
        const { data: invRows, error: invErr } = await admin
            .from("inventory")
            .select("product_id, current_stock, reserved_stock")
            .eq("store_id", storeId)
            .in("product_id", uniqueProductIds);

        if (invErr) {
            return errorResponse("Failed to verify inventory levels.", 500);
        }

        const invMap = new Map();
        (invRows || []).forEach((r) => invMap.set(r.product_id, r));

        const stockValidationItems = [];
        let hasInsufficientStock = false;

        for (const pId of uniqueProductIds) {
            const reqQty = aggregatedQuantities.get(pId);
            const inv = invMap.get(pId);
            const currentStock = inv ? Number(inv.current_stock ?? 0) : 0;
            const reservedStock = inv ? Number(inv.reserved_stock ?? 0) : 0;
            const availableQuantity = currentStock - reservedStock;
            const prod = productMap.get(pId);

            const isItemValid = allowNegativeStock || (availableQuantity >= reqQty);
            if (!isItemValid) {
                hasInsufficientStock = true;
            }

            stockValidationItems.push({
                productId: pId,
                productName: prod?.name || "Product",
                sku: prod?.sku || "",
                requestedQuantity: reqQty,
                availableQuantity,
                currentStock,
                reservedStock,
                valid: isItemValid,
                message: isItemValid
                    ? "Sufficient stock"
                    : `Insufficient stock: ${availableQuantity} available, ${reqQty} requested`,
            });
        }

        if (hasInsufficientStock) {
            return Response.json({
                success: false,
                valid: false,
                message: "One or more items exceed available stock.",
                allowNegativeStock,
                items: stockValidationItems,
                data: {
                    valid: false,
                    allowNegativeStock,
                    items: stockValidationItems,
                },
            }, { status: 400 });
        }

        // Authoritative calculation of totals
        let calculatedSubtotal = 0;
        const orderItemsToInsert = cleanedItems.map((item) => {
            const prod = productMap.get(item.productId);
            const unitPrice = Math.round(Number(prod.selling_price || 0) * 100) / 100;
            const unitCost = Math.round(Number(prod.purchase_price || 0) * 100) / 100;
            const lineSubtotal = Math.round(item.quantity * unitPrice * 100) / 100;
            calculatedSubtotal += lineSubtotal;

            return {
                store_id: storeId,
                product_id: prod.id,
                product_name: prod.name,
                sku: prod.sku,
                quantity: item.quantity,
                unit_price: unitPrice,
                unit_cost: unitCost,
                discount_amount: 0,
                tax_rate: Number(prod.tax_rate || 0),
                tax_amount: 0,
                line_total: lineSubtotal,
                updated_at: new Date().toISOString(),
            };
        });

        calculatedSubtotal = Math.round(calculatedSubtotal * 100) / 100;
        const notes = String(body.notes || "").trim();

        // Attempt RPC call for atomic creation
        let createdOrderId = null;
        let createdOrderNumber = null;

        const { data: rpcResult, error: rpcError } = await admin.rpc("create_pos_draft_order", {
            p_store_id: storeId,
            p_cashier_user_id: cashierId,
            p_customer_id: customerId,
            p_items: cleanedItems,
            p_idempotency_key: idempotencyKey,
            p_notes: notes,
        });

        if (!rpcError && rpcResult?.success) {
            createdOrderId = rpcResult.order_id;
            createdOrderNumber = rpcResult.order_number;
        } else {
            // Direct atomic insertion fallback if RPC is not present
            // Generate order number atomically
            let generatedNumber = null;
            const { data: nextNum } = await admin.rpc("next_document_number", {
                p_store_id: storeId,
                p_kind: "order",
            });
            if (nextNum) {
                generatedNumber = nextNum;
            } else {
                generatedNumber = `ORD-${Date.now().toString().slice(-6)}`;
            }

            const { data: insertedOrder, error: orderInsertErr } = await admin
                .from("orders")
                .insert({
                    store_id: storeId,
                    customer_id: customerId,
                    cashier_user_id: cashierId,
                    order_number: generatedNumber,
                    status: "draft",
                    currency_code: storeCurrency,
                    currency: storeCurrency,
                    subtotal: calculatedSubtotal,
                    total_amount: calculatedSubtotal,
                    notes,
                    idempotency_key: idempotencyKey,
                })
                .select("id, order_number, currency_code, currency")
                .single();

            if (orderInsertErr || !insertedOrder) {
                return errorResponse(`Failed to create order: ${orderInsertErr?.message || "Unknown error"}`, 500);
            }

            createdOrderId = insertedOrder.id;
            createdOrderNumber = insertedOrder.order_number;

            // Insert order items
            const itemsWithOrderId = orderItemsToInsert.map((item) => ({
                ...item,
                order_id: createdOrderId,
            }));

            const { error: itemsInsertErr } = await admin
                .from("order_items")
                .insert(itemsWithOrderId);

            if (itemsInsertErr) {
                // Clean up orphan header if items failed
                await admin.from("orders").delete().eq("id", createdOrderId);
                return errorResponse(`Failed to save order items: ${itemsInsertErr.message}`, 500);
            }
        }

        // Retrieve full created order to return to frontend
        const { data: fullOrder } = await admin
            .from("orders")
            .select(`
                id, order_number, store_id, customer_id, cashier_user_id,
                status, subtotal, total_amount, notes, created_at, updated_at, completed_at, completed_by,
                customer:customers (id, name, code, phone, email, is_walk_in),
                cashier:users (id, full_name, username, employee_code),
                store:stores (id, name, code),
                order_items (id, order_id, product_id, product_name, sku, quantity, unit_price, unit_cost, line_total, created_at)
            `)
            .eq("id", createdOrderId)
            .single();

        const formatted = formatOrderResponse(
            fullOrder,
            fullOrder?.order_items,
            fullOrder?.customer,
            fullOrder?.cashier,
            fullOrder?.store
        );

        return successResponse(
            { order: formatted },
            `Draft order ${createdOrderNumber || formatted.orderNumber} saved successfully`,
            201
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while saving the draft order.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

/**
 * GET /api/pos/orders
 * Retrieves POS order history with filtering, searching, and pagination.
 *
 * Requirements:
 *  - Require authentication & pos_orders.view permission
 *  - Retrieve real POS orders from Supabase (never mock data)
 *  - Order number, customer, cashier, store, date, status, total
 *  - Support search by order number or customer name
 *  - Support status filtering (draft, cancelled, all)
 *  - Support store filtering (respecting authenticated user's store access)
 *  - Support date filtering
 *  - Support pagination
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "pos_orders.view",
            "orders.view",
            "pos.use",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const url = new URL(request.url);
        const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
        const statusFilter = (url.searchParams.get("status") || "").trim();
        const requestedStoreId = (url.searchParams.get("storeId") || url.searchParams.get("store") || "").trim();
        const dateFilter = (url.searchParams.get("date") || url.searchParams.get("dateFilter") || "").trim();
        const startDate = url.searchParams.get("startDate");
        const endDate = url.searchParams.get("endDate");
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10) || 20));
        const offset = (page - 1) * limit;

        const authUserStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";

        // Store scoping: Cashiers can only view orders for their assigned store
        let effectiveStoreId = authUserStoreId;
        if (isAdmin && requestedStoreId && requestedStoreId !== "All Stores" && requestedStoreId !== "All") {
            effectiveStoreId = requestedStoreId;
        }

        const admin = getSupabaseAdmin();

        let query = admin
            .from("orders")
            .select(`
                id, order_number, store_id, customer_id, cashier_user_id,
                currency_code, currency,
                status, subtotal, total_amount, notes, created_at, updated_at, completed_at, completed_by,
                customer:customers (id, name, code, phone, email, is_walk_in),
                cashier:users (id, full_name, username, employee_code),
                store:stores (id, name, code),
                order_items (id, order_id, product_id, product_name, sku, quantity, unit_price, line_total)
            `, { count: "exact" });

        // Store scoping enforcement
        if (effectiveStoreId) {
            query = query.eq("store_id", effectiveStoreId);
        }

        // Status filter
        if (statusFilter && statusFilter !== "All Status" && statusFilter !== "All") {
            query = query.ilike("status", statusFilter);
        }

        // Search by order number or notes
        if (search) {
            const cleanSearch = search.replace(/[%_,]/g, "");
            if (cleanSearch) {
                query = query.or(`order_number.ilike.%${cleanSearch}%,notes.ilike.%${cleanSearch}%`);
            }
        }

        // Date filtering
        const now = new Date();
        if (startDate) {
            query = query.gte("created_at", new Date(startDate).toISOString());
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query = query.lte("created_at", end.toISOString());
        }

        if (!startDate && !endDate && dateFilter) {
            if (dateFilter === "Today") {
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                query = query.gte("created_at", todayStart.toISOString());
            } else if (dateFilter === "Last 7 Days") {
                const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                query = query.gte("created_at", sevenDaysAgo.toISOString());
            } else if (dateFilter === "Last 30 Days") {
                const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                query = query.gte("created_at", thirtyDaysAgo.toISOString());
            }
        }

        // Ordering & pagination
        query = query
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        const { data: rows, count, error } = await query;

        if (error) {
            return errorResponse(`Failed to retrieve orders: ${error.message}`, 500);
        }

        const formattedOrders = (rows || []).map((order) =>
            formatOrderResponse(
                order,
                order.order_items,
                order.customer,
                order.cashier,
                order.store
            )
        );

        const total = count ?? formattedOrders.length;
        const totalPages = Math.ceil(total / limit) || 1;

        return successResponse({
            orders: formattedOrders,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasMore: page < totalPages,
            },
        }, "Orders retrieved successfully");
    } catch (err) {
        return errorResponse("An unexpected error occurred while fetching orders.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

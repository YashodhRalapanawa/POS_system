import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../../lib/responses/index.js";

export const dynamic = "force-dynamic";

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
 * GET /api/pos/orders/[id]
 * Retrieves complete details for a single POS order.
 *
 * Requirements:
 *  - Require authentication & pos_orders.view permission
 *  - Return order header, customer, cashier, store, status, items, totals
 *  - Enforce store authorization
 *  - Controlled errors for missing (404) or unauthorized (403) orders
 */
export async function GET(request, { params }) {
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

        const { id: orderId } = await params;
        if (!orderId) {
            return errorResponse("Order ID is required.", 400);
        }

        const admin = getSupabaseAdmin();
        const { data: order, error } = await admin
            .from("orders")
            .select(`
                id, order_number, store_id, customer_id, cashier_user_id,
                currency_code, currency,
                status, subtotal, total_amount, notes, created_at, updated_at, completed_at, completed_by,
                customer:customers (id, name, code, phone, email, is_walk_in),
                cashier:users (id, full_name, username, employee_code),
                store:stores (id, name, code),
                order_items (id, order_id, product_id, product_name, sku, quantity, unit_price, unit_cost, line_total, created_at)
            `)
            .eq("id", orderId)
            .maybeSingle();

        if (error) {
            return errorResponse(`Failed to retrieve order: ${error.message}`, 500);
        }

        if (!order) {
            return errorResponse("Order not found.", 404);
        }

        // Store access check
        const authUserStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        if (authUserStoreId && order.store_id !== authUserStoreId && !isAdmin) {
            return errorResponse("You do not have access to view orders from this store.", 403);
        }

        const formatted = formatOrderResponse(
            order,
            order.order_items,
            order.customer,
            order.cashier,
            order.store
        );

        return successResponse({ order: formatted }, "Order details retrieved successfully");
    } catch (err) {
        return errorResponse("An unexpected error occurred while fetching order details.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

/**
 * PATCH /api/pos/orders/[id]
 * Updates an existing draft POS order.
 *
 * Requirements:
 *  - Require authentication & pos_orders.update permission
 *  - Allow modifications only while order is in 'draft' status
 *  - Reject modifying cancelled or completed orders
 *  - Validate customer and products (active, store-scoped)
 *  - Recalculate totals on backend from authoritative product prices
 *  - Preserve order number
 *  - Update header and items atomically
 *  - Respect store access restrictions
 */
export async function PATCH(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "pos_orders.update",
            "orders.manage",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const { id: orderId } = await params;
        if (!orderId) {
            return errorResponse("Order ID is required.", 400);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON request payload.", 400);
        }

        const admin = getSupabaseAdmin();

        // 1. Fetch existing order to check status and store ownership
        const { data: existingOrder, error: fetchErr } = await admin
            .from("orders")
            .select("id, store_id, order_number, status, customer_id, subtotal, total_amount, notes")
            .eq("id", orderId)
            .maybeSingle();

        if (fetchErr) {
            return errorResponse(`Failed to find order: ${fetchErr.message}`, 500);
        }
        if (!existingOrder) {
            return errorResponse("Order not found.", 404);
        }

        // Store access verification
        const authUserStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        if (authUserStoreId && existingOrder.store_id !== authUserStoreId && !isAdmin) {
            return errorResponse("You do not have access to edit orders from this store.", 403);
        }

        // Only draft orders are editable
        const currentStatus = String(existingOrder.status || "").toLowerCase();
        if (currentStatus !== "draft") {
            return errorResponse(
                `Only draft orders can be edited. This order is currently in "${existingOrder.status}" status.`,
                400
            );
        }

        const storeId = existingOrder.store_id;

        // 2. Validate customer if customerId provided in update
        let updatedCustomerId = existingOrder.customer_id;
        if (body.customerId !== undefined || body.customer_id !== undefined) {
            const reqCustId = body.customerId || body.customer_id;
            if (reqCustId) {
                const { data: cust, error: custErr } = await admin
                    .from("customers")
                    .select("id, status")
                    .eq("id", reqCustId)
                    .eq("store_id", storeId)
                    .maybeSingle();

                if (custErr || !cust) {
                    return errorResponse("Selected customer was not found in this store.", 400);
                }
                if (cust.status !== "Active") {
                    return errorResponse("Selected customer is inactive.", 400);
                }
                updatedCustomerId = cust.id;
            } else {
                // Find default walk-in customer
                const { data: walkIn } = await admin
                    .from("customers")
                    .select("id")
                    .eq("store_id", storeId)
                    .eq("is_walk_in", true)
                    .maybeSingle();
                updatedCustomerId = walkIn?.id || null;
            }
        }

        // 3. Process items if provided
        let newItemsPayload = null;
        let calculatedSubtotal = existingOrder.subtotal;

        if (Array.isArray(body.items)) {
            if (body.items.length === 0) {
                return errorResponse("Cart must contain at least one item.", 400);
            }

            const cleanedItems = [];
            for (const item of body.items) {
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

            // Fetch authoritative products
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
                const prod = productMap.get(item.productId);
                if (!prod) {
                    return errorResponse(`Product with ID ${item.productId} was not found in this store.`, 400);
                }
                if (prod.status !== "Active") {
                    return errorResponse(`Product "${prod.name}" is inactive and cannot be ordered.`, 400);
                }
            }

            // Authoritative stock validation for updated draft order items (Task 19)
            const { data: storeSetting } = await admin
                .from("store_settings")
                .select("allow_negative_stock")
                .eq("store_id", storeId)
                .maybeSingle();

            const allowNegativeStock = Boolean(storeSetting?.allow_negative_stock);

            // Aggregate duplicate product quantities
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

            let subtotalAcc = 0;
            newItemsPayload = cleanedItems.map((item) => {
                const prod = productMap.get(item.productId);
                const unitPrice = Math.round(Number(prod.selling_price || 0) * 100) / 100;
                const unitCost = Math.round(Number(prod.purchase_price || 0) * 100) / 100;
                const lineSubtotal = Math.round(item.quantity * unitPrice * 100) / 100;
                subtotalAcc += lineSubtotal;

                return {
                    store_id: storeId,
                    order_id: orderId,
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

            calculatedSubtotal = Math.round(subtotalAcc * 100) / 100;
        }

        const updatedNotes = body.notes !== undefined ? String(body.notes || "").trim() : existingOrder.notes;

        // Try RPC first for atomic update
        const { data: rpcRes, error: rpcErr } = await admin.rpc("update_pos_draft_order", {
            p_order_id: orderId,
            p_store_id: storeId,
            p_customer_id: updatedCustomerId,
            p_items: Array.isArray(body.items) ? body.items.map((it) => ({
                productId: it.productId || it.product_id,
                quantity: it.quantity,
            })) : null,
            p_notes: updatedNotes,
        });

        if (rpcErr || !rpcRes?.success) {
            // Direct fallback atomic update
            if (newItemsPayload) {
                await admin.from("order_items").delete().eq("order_id", orderId);
                const { error: insertItemsErr } = await admin.from("order_items").insert(newItemsPayload);
                if (insertItemsErr) {
                    return errorResponse(`Failed to update order items: ${insertItemsErr.message}`, 500);
                }
            }

            const { error: headerUpdateErr } = await admin
                .from("orders")
                .update({
                    customer_id: updatedCustomerId,
                    subtotal: calculatedSubtotal,
                    total_amount: calculatedSubtotal,
                    notes: updatedNotes,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", orderId);

            if (headerUpdateErr) {
                return errorResponse(`Failed to update order header: ${headerUpdateErr.message}`, 500);
            }
        }

        // Retrieve and return refreshed order
        const { data: refreshedOrder } = await admin
            .from("orders")
            .select(`
                id, order_number, store_id, customer_id, cashier_user_id,
                status, subtotal, total_amount, notes, created_at, updated_at, completed_at, completed_by,
                customer:customers (id, name, code, phone, email, is_walk_in),
                cashier:users (id, full_name, username, employee_code),
                store:stores (id, name, code),
                order_items (id, order_id, product_id, product_name, sku, quantity, unit_price, unit_cost, line_total, created_at)
            `)
            .eq("id", orderId)
            .single();

        const formatted = formatOrderResponse(
            refreshedOrder,
            refreshedOrder?.order_items,
            refreshedOrder?.customer,
            refreshedOrder?.cashier,
            refreshedOrder?.store
        );

        return successResponse(
            { order: formatted },
            `Draft order ${formatted.orderNumber} updated successfully`
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while updating the draft order.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

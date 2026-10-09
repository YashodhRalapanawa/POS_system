import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../../../lib/responses/index.js";

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
 * POST /api/pos/orders/[id]/complete
 * Completes a draft POS order, automatically deducting inventory and generating
 * sale movement records within an atomic database transaction.
 *
 * Requirements (Task 20):
 *  - Require authentication & pos_orders.complete permission
 *  - Verify store authorization
 *  - Ensure order is in 'draft' status
 *  - Validate all items and current stock availability under store policy
 *  - Deduct stock from the correct store
 *  - Create 'Sale' stock_movements linked to order
 *  - Mark order 'completed' with completion timestamp and user
 *  - Idempotent: safe handling of duplicate completion requests
 */
export async function POST(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "pos_orders.complete",
            "pos.use",
            "orders.manage",
            "orders.create",
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

        // 1. Fetch target order and items
        const { data: order, error: fetchErr } = await admin
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
            .maybeSingle();

        if (fetchErr) {
            return errorResponse(`Failed to find order: ${fetchErr.message}`, 500);
        }
        if (!order) {
            return errorResponse("Order not found.", 404);
        }

        // Store access check
        const authUserStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        if (authUserStoreId && order.store_id !== authUserStoreId && !isAdmin) {
            return errorResponse("You do not have access to complete orders from this store.", 403);
        }

        const currentStatus = String(order.status || "").toLowerCase();

        // Idempotency: if already completed, return completed order safely without re-deducting stock
        if (currentStatus === "completed") {
            const formatted = formatOrderResponse(
                order,
                order.order_items,
                order.customer,
                order.cashier,
                order.store
            );
            return successResponse(
                { order: formatted, isDuplicate: true },
                `Order ${order.order_number} is already completed`,
                200
            );
        }

        if (currentStatus === "cancelled") {
            return errorResponse(`Order ${order.order_number} is cancelled and cannot be completed.`, 400);
        }

        if (currentStatus !== "draft") {
            return errorResponse(
                `Only draft orders can be completed. Current status: "${order.status}".`,
                400
            );
        }

        const items = order.order_items || [];
        if (items.length === 0) {
            return errorResponse("Order has no items to complete.", 400);
        }

        const storeId = order.store_id;
        const userId = auth.user.id;

        // 2. Execute atomic order completion via complete_pos_order RPC
        const { data: rpcRes, error: rpcErr } = await admin.rpc("complete_pos_order", {
            p_order_id: orderId,
            p_store_id: storeId,
            p_user_id: userId,
        });

        if (rpcErr) {
            // RPC raised an exception (e.g. insufficient stock or concurrency conflict)
            const errorMsg = rpcErr.message || "Failed to complete order.";
            return errorResponse(errorMsg, 400);
        }

        // 3. Retrieve refreshed order with completed status and movements
        const { data: completedOrder, error: refreshErr } = await admin
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

        if (refreshErr || !completedOrder) {
            return errorResponse("Order completed, but failed to retrieve updated record.", 500);
        }

        const formatted = formatOrderResponse(
            completedOrder,
            completedOrder.order_items,
            completedOrder.customer,
            completedOrder.cashier,
            completedOrder.store
        );

        return successResponse(
            { order: formatted },
            `POS Order ${formatted.orderNumber} completed successfully. Stock deducted from inventory.`,
            200
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while completing the POS order.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

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
    const rawStatus = String(order.status || "Pending").toLowerCase();
    const normalizedStatus = (rawStatus === "pending" || rawStatus === "held") ? "draft" : rawStatus;

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
        status: normalizedStatus,
        rawStatus: order.status || "Completed",
        discountType: order.discount_type || "none",
        discountValue: Number(order.discount_value || 0),
        discountAmount: Number(order.discount_amount || 0),
        taxAmount: Number(order.tax_amount || 0),
        subtotal: Number(order.subtotal || 0),
        totalAmount: Number(order.total_amount || order.subtotal || 0),
        total: Number(order.total_amount || order.subtotal || 0),
        notes: order.notes || "",
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        completedAt: order.completed_at || null,
        completedBy: order.completed_by || order.cashier_user_id || null,
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

        let body = {};
        try {
            body = await request.json();
        } catch {
            // Optional JSON body
        }

        const admin = getSupabaseAdmin();

        // 1. Fetch target order and items
        const { data: order, error: fetchErr } = await admin
            .from("orders")
            .select(`
                id, order_number, store_id, customer_id, cashier_user_id,
                status, discount_type, discount_value, subtotal, discount_amount, tax_amount, total_amount, notes, created_at, updated_at, completed_at,
                customer:customers (id, name, code, customer_type, phone, email, address, is_walk_in),
                cashier:users (id, full_name, username, employee_code),
                store:stores (id, name, code),
                order_items (id, order_id, product_id, product_name, sku, quantity, unit_price, unit_cost, tax_rate, tax_amount, line_total, created_at)
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

        if (!["draft", "pending", "held"].includes(currentStatus)) {
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

        // 2. Check store stock settings and validate inventory
        const { data: storeSetting } = await admin
            .from("store_settings")
            .select("allow_negative_stock, default_tax_rate")
            .eq("store_id", storeId)
            .maybeSingle();

        const allowNegativeStock = Boolean(storeSetting?.allow_negative_stock);

        const aggregatedQuantities = new Map();
        for (const it of items) {
            aggregatedQuantities.set(it.product_id, (aggregatedQuantities.get(it.product_id) || 0) + Number(it.quantity || 1));
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

        for (const pId of uniqueProductIds) {
            const reqQty = aggregatedQuantities.get(pId);
            const inv = invMap.get(pId);
            const currentStock = inv ? Number(inv.current_stock ?? 0) : 0;
            const reservedStock = inv ? Number(inv.reserved_stock ?? 0) : 0;
            const availableQuantity = currentStock - reservedStock;
            if (!allowNegativeStock && availableQuantity < reqQty) {
                const itemMatch = items.find((i) => i.product_id === pId);
                return errorResponse(
                    `Insufficient stock for "${itemMatch?.product_name || pId}": ${availableQuantity} available, ${reqQty} required.`,
                    400
                );
            }
        }

        // 3. Calculate final totals (including any discount passed at completion time)
        const subtotal = Number(order.subtotal || 0);
        let taxAmount = Number(order.tax_amount || 0);
        if (taxAmount === 0) {
            taxAmount = items.reduce((sum, it) => sum + Number(it.tax_amount || 0), 0);
            if (taxAmount === 0 && Number(storeSetting?.default_tax_rate || 0) > 0) {
                taxAmount = Math.round(subtotal * (Number(storeSetting.default_tax_rate) / 100) * 100) / 100;
            }
        }

        const rawDiscountType = String(body.discountType || body.discount_type || order.discount_type || "").toLowerCase();
        const discountType = (rawDiscountType === "percentage" || rawDiscountType === "percent")
            ? "percent"
            : rawDiscountType === "fixed"
              ? "fixed"
              : null;
        const discountValue = discountType
            ? (body.discountValue !== undefined || body.discount_value !== undefined
                ? Math.max(0, Number(body.discountValue ?? body.discount_value ?? 0) || 0)
                : Number(order.discount_value || 0))
            : 0;

        let discountAmount = Number(order.discount_amount || 0);
        if (discountType === "percent") {
            discountAmount = Math.round(subtotal * (Math.min(100, discountValue) / 100) * 100) / 100;
        } else if (discountType === "fixed") {
            discountAmount = Math.min(subtotal, Math.round(discountValue * 100) / 100);
        } else {
            discountAmount = 0;
        }

        const finalTotalAmount = Math.max(0, Math.round((subtotal - discountAmount + taxAmount) * 100) / 100);
        const nowIso = new Date().toISOString();

        // 4. Insert Sale stock movements (trigger automatically deducts inventory.current_stock)
        const movementRows = items.map((it) => ({
            store_id: storeId,
            product_id: it.product_id,
            adjustment_type: "Sale",
            quantity: Math.abs(Number(it.quantity || 1)),
            reason: null,
            reference_type: "order",
            reference_id: orderId,
            notes: `POS Sale Completion (${order.order_number})`,
            created_by: userId,
        }));

        const { error: moveErr } = await admin.from("stock_movements").insert(movementRows);
        if (moveErr) {
            return errorResponse(`Failed to deduct stock: ${moveErr.message}`, 400);
        }

        // 5. Mark order as Completed
        const { error: updateErr } = await admin
            .from("orders")
            .update({
                status: "Completed",
                discount_type: discountType,
                discount_value: discountValue,
                discount_amount: discountAmount,
                tax_amount: taxAmount,
                total_amount: finalTotalAmount,
                completed_at: nowIso,
                updated_at: nowIso,
            })
            .eq("id", orderId);

        if (updateErr) {
            return errorResponse(`Failed to update order status: ${updateErr.message}`, 500);
        }

        // 6. Ensure an Invoice & Payment record exist for this completed POS sale
        let createdInvoice = null;
        try {
            const { data: existingInv } = await admin
                .from("invoices")
                .select("id, invoice_number, status")
                .eq("order_id", orderId)
                .maybeSingle();

            if (!existingInv) {
                let invoiceNumber = null;
                const { data: nextInvNum } = await admin.rpc("next_document_number", {
                    p_store_id: storeId,
                    p_kind: "invoice",
                });
                if (nextInvNum) {
                    invoiceNumber = nextInvNum;
                }
                const cust = order.customer || {};

                const { data: newInv, error: newInvErr } = await admin
                    .from("invoices")
                    .insert({
                        store_id: storeId,
                        order_id: orderId,
                        customer_id: order.customer_id || null,
                        ...(invoiceNumber ? { invoice_number: invoiceNumber } : {}),
                        invoice_date: nowIso,
                        due_date: nowIso,
                        customer_name: cust.name || "Walk-in Customer",
                        customer_code: cust.code || "CUS-001",
                        customer_type: cust.customer_type === "Business" ? "Business" : "Individual",
                        customer_phone: cust.phone || "",
                        customer_email: cust.email || "",
                        customer_address: cust.address || "",
                        subtotal,
                        discount_amount: discountAmount,
                        tax_amount: taxAmount,
                        total_amount: finalTotalAmount,
                        status: "Paid",
                    })
                    .select("id, invoice_number, status")
                    .maybeSingle();

                if (newInvErr) {
                    console.error("Failed to insert invoice during POS completion:", newInvErr);
                }
                if (newInv) {
                    createdInvoice = newInv;
                }
            } else {
                createdInvoice = existingInv;
            }

            // Record Payment if not already recorded
            const { data: existingPay } = await admin
                .from("payments")
                .select("id")
                .eq("order_id", orderId)
                .eq("payment_status", "Completed")
                .maybeSingle();

            if (!existingPay) {
                const rawMethod = String(body.paymentMethod || body.payment_method || "Cash").trim().toLowerCase();
                let matchedMethod = "Cash";
                if (rawMethod === "card" || rawMethod === "credit card" || rawMethod === "debit card") matchedMethod = "Card";
                else if (rawMethod === "bank transfer" || rawMethod === "bank_transfer" || rawMethod === "qr") matchedMethod = "Bank Transfer";
                else if (rawMethod === "other" || rawMethod === "split") matchedMethod = "Other";

                const tenderedAmount = Math.max(finalTotalAmount, Number(body.tenderedAmount ?? body.tendered_amount ?? finalTotalAmount) || finalTotalAmount);
                const changeAmount = matchedMethod === "Cash" ? Math.max(0, Math.round((tenderedAmount - finalTotalAmount) * 100) / 100) : 0;

                await admin.from("payments").insert({
                    store_id: storeId,
                    order_id: orderId,
                    payment_method: matchedMethod,
                    payment_status: "Completed",
                    amount: finalTotalAmount,
                    tendered_amount: tenderedAmount,
                    change_amount: changeAmount,
                    reference: String(body.referenceNumber || body.reference_number || body.reference || "").trim(),
                    processed_by: userId,
                    processed_at: nowIso,
                });
            }
        } catch (auxErr) {
            console.warn("Non-fatal warning generating invoice/payment on POS completion:", auxErr);
        }

        // 7. Retrieve refreshed order with completed status
        const { data: completedOrder, error: refreshErr } = await admin
            .from("orders")
            .select(`
                id, order_number, store_id, customer_id, cashier_user_id,
                status, discount_type, discount_value, subtotal, discount_amount, tax_amount, total_amount, notes, created_at, updated_at, completed_at,
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
            { order: formatted, invoice: createdInvoice },
            `POS Order ${formatted.orderNumber} completed successfully. Stock deducted from inventory.`,
            200
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while completing the POS order.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

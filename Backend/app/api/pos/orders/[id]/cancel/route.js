import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../../../lib/responses/index.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/pos/orders/[id]/cancel
 * Cancels an eligible draft POS order.
 *
 * Requirements:
 *  - Require authentication & pos_orders.cancel permission
 *  - Allow cancellation of eligible draft orders only
 *  - Prevent duplicate cancellation
 *  - Do not delete order records
 *  - Do not create inventory movements (stock was not deducted)
 *  - Record responsible user and timestamp
 *  - Respect store access restrictions
 */
export async function POST(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "pos_orders.cancel",
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

        let body = {};
        try {
            body = await request.json();
        } catch {
            // Body is optional for cancellation
        }

        const reason = String(body.reason || "").trim();
        const admin = getSupabaseAdmin();

        // 1. Fetch existing order
        const { data: order, error: fetchErr } = await admin
            .from("orders")
            .select(`
                id, order_number, store_id, customer_id, cashier_user_id,
                status, subtotal, total_amount, notes, created_at, updated_at,
                customer:customers (id, name, code, phone, email, is_walk_in),
                cashier:users (id, full_name, username, employee_code),
                store:stores (id, name, code)
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
            return errorResponse("You do not have access to cancel orders from this store.", 403);
        }

        const currentStatus = String(order.status || "").toLowerCase();

        // Check if already cancelled
        if (currentStatus === "cancelled") {
            return errorResponse(`Order ${order.order_number} is already cancelled.`, 400);
        }

        // Only draft orders can be cancelled in this task
        if (currentStatus !== "draft") {
            return errorResponse(
                `Only draft orders can be cancelled. This order is in "${order.status}" status and cannot be cancelled here.`,
                400
            );
        }

        // Append cancellation detail to notes
        const cancelUserStamp = `Cancelled by ${auth.user.fullName || auth.user.username} at ${new Date().toISOString()}`;
        const updatedNotes = order.notes
            ? `${order.notes}\n${cancelUserStamp}${reason ? `: ${reason}` : ""}`
            : `${cancelUserStamp}${reason ? `: ${reason}` : ""}`;

        // Attempt RPC call
        const { data: rpcRes, error: rpcErr } = await admin.rpc("cancel_pos_draft_order", {
            p_order_id: orderId,
            p_store_id: order.store_id,
            p_user_id: auth.user.id,
            p_reason: reason,
        });

        if (rpcErr || !rpcRes?.success) {
            // Direct fallback update
            const { error: updateErr } = await admin
                .from("orders")
                .update({
                    status: "cancelled",
                    notes: updatedNotes,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", orderId);

            if (updateErr) {
                return errorResponse(`Failed to cancel order: ${updateErr.message}`, 500);
            }
        }

        // Return updated order
        return successResponse(
            {
                order: {
                    id: order.id,
                    orderNumber: order.order_number,
                    status: "cancelled",
                    updatedAt: new Date().toISOString(),
                },
            },
            `Draft order ${order.order_number} was cancelled successfully`
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while cancelling the draft order.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

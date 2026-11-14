import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../../lib/responses/index.js";
import { fetchInvoiceWithDetails } from "../../../../../lib/invoices/invoiceService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/invoices/order/[orderId]
 * Retrieves the invoice associated with a specific order (by order UUID or order_number).
 */
export async function GET(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "invoices.view",
            "invoices.manage",
            "pos.use",
            "orders.view",
            "pos_orders.view",
            "returns.view",
            "reports.view",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const { orderId: rawOrderId } = await params;
        const orderParam = (rawOrderId || "").trim();
        if (!orderParam) {
            return errorResponse("Order ID is required.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const scopedStoreId = isAdmin ? null : authStoreId;

        let targetOrderUuid = orderParam;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderParam);
        if (!isUuid) {
            let ordQuery = admin.from("orders").select("id").eq("order_number", orderParam);
            if (scopedStoreId) {
                ordQuery = ordQuery.eq("store_id", scopedStoreId);
            }
            const { data: ordMatch } = await ordQuery.maybeSingle();
            if (!ordMatch) {
                return errorResponse(`Order "${orderParam}" not found.`, 404);
            }
            targetOrderUuid = ordMatch.id;
        }

        const { invoice, error } = await fetchInvoiceWithDetails(
            admin,
            "order_id",
            targetOrderUuid,
            scopedStoreId
        );

        if (error || !invoice) {
            return errorResponse("No invoice found for the specified order.", 404);
        }

        return successResponse({ invoice }, "Invoice retrieved for order");
    } catch (err) {
        return errorResponse("An unexpected error occurred while retrieving the order's invoice.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


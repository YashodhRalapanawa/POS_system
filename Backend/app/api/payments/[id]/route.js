import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../lib/responses/index.js";
import {
    formatPaymentResponse,
    normalizePaymentStatus,
    finalizeOrderAndDeductStockOnce,
} from "../../../../lib/payments/paymentService.js";
import { fetchInvoiceWithDetails } from "../../../../lib/invoices/invoiceService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/[id]
 * Retrieves a single payment record by ID.
 */
export async function GET(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "payments.view",
            "payments.create",
            "payments.manage",
            "pos.use",
            "invoices.view",
            "orders.view",
            "reports.view",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const { id: paymentId } = await params;
        if (!paymentId) {
            return errorResponse("Payment ID is required.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";

        let query = admin
            .from("payments")
            .select(`
                *,
                order:orders (id, order_number, status, total_amount),
                processor:users (id, full_name, username)
            `)
            .eq("id", paymentId);

        if (!isAdmin && authStoreId) {
            query = query.eq("store_id", authStoreId);
        }

        const { data: payment, error } = await query.maybeSingle();
        if (error || !payment) {
            return errorResponse("Payment not found.", 404);
        }

        // Also fetch associated invoice number if available
        const { data: inv } = await admin
            .from("invoices")
            .select("id, invoice_number, status")
            .eq("order_id", payment.order_id)
            .maybeSingle();

        const formatted = formatPaymentResponse(payment, {
            orderNumber: payment.order?.order_number,
            invoiceId: inv?.id || payment.invoice_id,
            invoiceNumber: inv?.invoice_number || "",
        });

        return successResponse({ payment: formatted }, "Payment retrieved successfully");
    } catch (err) {
        return errorResponse("An unexpected error occurred while retrieving the payment.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

/**
 * PATCH /api/payments/[id]
 * Updates payment status (e.g. from PENDING to PAID / Completed or FAILED).
 */
export async function PATCH(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "payments.manage",
            "payments.create",
            "pos.use",
            "invoices.manage",
            "orders.manage",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const { id: paymentId } = await params;
        if (!paymentId) {
            return errorResponse("Payment ID is required.", 400);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON request payload.", 400);
        }

        const nextStatus = normalizePaymentStatus(body.status || body.paymentStatus || body.payment_status);
        if (!nextStatus) {
            return errorResponse("Invalid payment status. Allowed values: PENDING, PAID (Completed), FAILED.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";

        let query = admin.from("payments").select("*").eq("id", paymentId);
        if (!isAdmin && authStoreId) {
            query = query.eq("store_id", authStoreId);
        }

        const { data: existing, error: findErr } = await query.maybeSingle();
        if (findErr || !existing) {
            return errorResponse("Payment not found.", 404);
        }

        if (nextStatus === "Completed" && existing.payment_status !== "Completed") {
            const stockRes = await finalizeOrderAndDeductStockOnce(admin, {
                orderId: existing.order_id,
                storeId: existing.store_id,
                userId: auth.user.id,
            });
            if (!stockRes.completed) {
                return errorResponse(stockRes.error || "Failed to finalize order stock.", 400);
            }
        }

        const { data: updated, error: updateErr } = await admin
            .from("payments")
            .update({
                payment_status: nextStatus,
                ...(body.reference !== undefined ? { reference: String(body.reference).trim() } : {}),
            })
            .eq("id", paymentId)
            .select("*")
            .single();

        if (updateErr || !updated) {
            return errorResponse(`Failed to update payment: ${updateErr?.message || "Unknown error"}`, 500);
        }

        if (nextStatus === "Completed") {
            await admin
                .from("invoices")
                .update({ status: "Paid", updated_at: new Date().toISOString() })
                .eq("order_id", existing.order_id);
        }

        const invDetails = await fetchInvoiceWithDetails(admin, "order_id", existing.order_id, existing.store_id);

        return successResponse(
            {
                payment: formatPaymentResponse(updated, {
                    invoiceId: invDetails.invoice?.id,
                    invoiceNumber: invDetails.invoice?.invoiceNumber,
                    orderNumber: invDetails.invoice?.orderNumber,
                }),
                invoice: invDetails.invoice || null,
            },
            `Payment status updated to ${nextStatus === "Completed" ? "PAID" : nextStatus.toUpperCase()}`
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while updating the payment.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../../lib/responses/index.js";
import { formatPaymentResponse } from "../../../../../lib/payments/paymentService.js";
import { fetchInvoiceWithDetails } from "../../../../../lib/invoices/invoiceService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/invoice/[invoiceId]
 * Retrieves all payments recorded for a specific invoice (by invoice UUID or invoice_number).
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

        const { invoiceId: rawInvoiceId } = await params;
        const invoiceParam = (rawInvoiceId || "").trim();
        if (!invoiceParam) {
            return errorResponse("Invoice ID is required.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const scopedStoreId = isAdmin ? null : authStoreId;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceParam);
        const lookupCol = isUuid ? "id" : "invoice_number";

        const { invoice, rawInvoice, error: invErr } = await fetchInvoiceWithDetails(
            admin,
            lookupCol,
            invoiceParam,
            scopedStoreId
        );

        if (invErr || !invoice || !rawInvoice) {
            return errorResponse("Invoice not found.", 404);
        }

        const { data: paymentsRows, error: payErr } = await admin
            .from("payments")
            .select(`
                *,
                processor:users (id, full_name, username)
            `)
            .eq("order_id", rawInvoice.order_id)
            .order("processed_at", { ascending: false });

        if (payErr) {
            return errorResponse(`Failed to retrieve payments for invoice: ${payErr.message}`, 500);
        }

        const formattedPayments = (paymentsRows || []).map((p) =>
            formatPaymentResponse(p, {
                orderNumber: invoice.orderNumber,
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
            })
        );

        return successResponse(
            {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                orderId: invoice.orderUuid,
                orderNumber: invoice.orderNumber,
                totalAmount: invoice.totalAmount,
                paidAmount: invoice.paidAmount,
                balanceDue: invoice.balanceDue,
                paymentStatus: invoice.paymentStatus,
                payments: formattedPayments,
            },
            "Invoice payments retrieved successfully"
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while retrieving invoice payments.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


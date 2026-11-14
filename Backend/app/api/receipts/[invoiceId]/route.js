import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../lib/responses/index.js";
import { buildReceiptForInvoice } from "../../../../lib/receipts/receiptService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/receipts/[invoiceId]
 * Generates printable/downloadable receipt data from invoice, order, and payment records.
 * Accepts invoice UUID, invoice_number (e.g. INV-1001), order UUID, or order_number (e.g. ORD-1001).
 */
export async function GET(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "receipts.view",
            "invoices.view",
            "payments.view",
            "pos.use",
            "orders.view",
            "pos_orders.view",
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
            return errorResponse("Invoice ID is required to generate a receipt.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const scopedStoreId = isAdmin ? null : authStoreId;

        const result = await buildReceiptForInvoice(admin, {
            invoiceOrOrderParam: invoiceParam,
            storeId: scopedStoreId,
        });

        if (result.error) {
            return errorResponse(result.error, result.status || 404);
        }

        return successResponse(
            {
                receipt: result.receipt,
                invoice: result.invoice,
            },
            `Receipt ${result.receipt.receiptNumber} generated successfully`
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while generating the receipt.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


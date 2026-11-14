import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../lib/responses/index.js";
import { fetchInvoiceWithDetails } from "../../../../lib/invoices/invoiceService.js";

export const dynamic = "force-dynamic";

const ALLOWED_INVOICE_STATUSES = ["Paid", "Pending", "Overdue", "Cancelled", "Refunded"];

/**
 * GET /api/invoices/[id]
 * Retrieves a single invoice by UUID or by invoice_number (e.g. INV-1001).
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

        const { id: rawId } = await params;
        const invoiceParam = (rawId || "").trim();
        if (!invoiceParam) {
            return errorResponse("Invoice ID is required.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const scopedStoreId = isAdmin ? null : authStoreId;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceParam);
        const lookupColumn = isUuid ? "id" : "invoice_number";

        const { invoice, error } = await fetchInvoiceWithDetails(
            admin,
            lookupColumn,
            invoiceParam,
            scopedStoreId
        );

        if (error || !invoice) {
            return errorResponse("Invoice not found.", 404);
        }

        return successResponse({ invoice }, "Invoice retrieved successfully");
    } catch (err) {
        return errorResponse("An unexpected error occurred while retrieving the invoice.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

/**
 * Shared handler for PATCH / PUT /api/invoices/[id]
 * Allows updating invoice status (e.g. Paid, Cancelled, Overdue), due_date, or notes.
 */
async function handleUpdateInvoice(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "invoices.manage",
            "invoices.create",
            "orders.manage",
            "pos.use",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const { id: rawId } = await params;
        const invoiceParam = (rawId || "").trim();
        if (!invoiceParam) {
            return errorResponse("Invoice ID is required.", 400);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON request payload.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const scopedStoreId = isAdmin ? null : authStoreId;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceParam);
        const lookupColumn = isUuid ? "id" : "invoice_number";

        const { rawInvoice, error: findErr } = await fetchInvoiceWithDetails(
            admin,
            lookupColumn,
            invoiceParam,
            scopedStoreId
        );

        if (findErr || !rawInvoice) {
            return errorResponse("Invoice not found.", 404);
        }

        const updates = {
            updated_at: new Date().toISOString(),
        };

        if (body.status !== undefined) {
            const matchedStatus = ALLOWED_INVOICE_STATUSES.find(
                (s) => s.toLowerCase() === String(body.status).trim().toLowerCase()
            );
            if (!matchedStatus) {
                return errorResponse(
                    `Invalid invoice status "${body.status}". Allowed values: ${ALLOWED_INVOICE_STATUSES.join(", ")}.`,
                    400
                );
            }
            updates.status = matchedStatus;
        }

        if (body.dueDate !== undefined || body.due_date !== undefined) {
            const rawDue = body.dueDate ?? body.due_date;
            updates.due_date = rawDue ? new Date(rawDue).toISOString() : null;
        }

        const { error: updateErr } = await admin
            .from("invoices")
            .update(updates)
            .eq("id", rawInvoice.id);

        if (updateErr) {
            return errorResponse(`Failed to update invoice: ${updateErr.message}`, 500);
        }

        const refreshed = await fetchInvoiceWithDetails(admin, "id", rawInvoice.id, scopedStoreId);
        return successResponse(
            { invoice: refreshed.invoice },
            `Invoice ${rawInvoice.invoice_number} updated successfully`
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while updating the invoice.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

export async function PATCH(request, context) {
    return handleUpdateInvoice(request, context);
}

export async function PUT(request, context) {
    return handleUpdateInvoice(request, context);
}


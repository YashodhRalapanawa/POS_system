import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../lib/responses/index.js";
import {
    getCreditNotesList,
    formatCreditNoteResponse,
} from "../../../lib/creditNotes/creditNoteService.js";
import { fetchReturnWithDetails } from "../../../lib/returns/returnService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/credit-notes
 * Lists credit notes with search and status filtering.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "credit_notes.view",
            "credit_notes.create",
            "returns.view",
            "invoices.view",
            "pos.use",
            "reports.view",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const url = new URL(request.url);
        const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
        const status = (url.searchParams.get("status") || "").trim();
        const requestedStoreId = (url.searchParams.get("storeId") || "").trim();
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));

        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        let effectiveStoreId = authStoreId;
        if (isAdmin && requestedStoreId && requestedStoreId !== "All" && requestedStoreId !== "All Stores") {
            effectiveStoreId = requestedStoreId;
        }

        const admin = getSupabaseAdmin();

        const { creditNotes, total, error } = await getCreditNotesList(admin, {
            storeId: effectiveStoreId,
            search,
            status,
            page,
            limit,
        });

        if (error) {
            return errorResponse(`Failed to retrieve credit notes: ${error.message || error}`, 500);
        }

        const totalPages = Math.ceil(total / limit) || 1;

        return successResponse(
            {
                creditNotes,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasMore: page < totalPages,
                },
            },
            "Credit notes retrieved successfully"
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while fetching credit notes.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

/**
 * POST /api/credit-notes
 * Creates/issues a credit note from a return.
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "credit_notes.create",
            "returns.process",
            "orders.manage",
            "pos.use",
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

        const returnId = body.returnId || body.return_id;
        if (!returnId) {
            return errorResponse("Return ID is required to generate a credit note.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const scopedStoreId = isAdmin ? null : authStoreId;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(returnId);
        const col = isUuid ? "id" : "return_number";

        const { returnRecord: ret, rawReturn, error: retErr } = await fetchReturnWithDetails(
            admin,
            col,
            returnId,
            scopedStoreId
        );

        if (retErr || !ret || !rawReturn) {
            return errorResponse("Return record not found.", 404);
        }

        const cnNumber = `CN-${rawReturn.return_number?.replace(/^RET-?/i, "") || Date.now().toString().slice(-6)}`;
        const nowIso = new Date().toISOString();

        const virtualCn = {
            id: rawReturn.id,
            credit_note_number: cnNumber,
            store_id: rawReturn.store_id,
            return_id: rawReturn.id,
            invoice_id: null,
            order_id: rawReturn.order_id,
            customer_id: rawReturn.customer_id,
            issue_date: rawReturn.completed_at || nowIso,
            reason: body.reason || rawReturn.reason,
            refund_method: body.refundMethod || rawReturn.refund_method,
            subtotal: rawReturn.subtotal,
            tax_amount: rawReturn.tax_amount,
            total_amount: rawReturn.refund_amount,
            remaining_amount: rawReturn.refund_amount,
            status: "Issued",
            notes: body.notes || `Credit note for return ${rawReturn.return_number}`,
            issued_by: auth.user.id,
            created_at: rawReturn.completed_at || nowIso,
            updated_at: nowIso,
        };

        const cnItems = (ret.items || []).map((it) => ({
            id: it.id,
            store_id: rawReturn.store_id,
            credit_note_id: rawReturn.id,
            return_item_id: it.id,
            order_item_id: it.orderItemId,
            product_id: it.productId,
            product_name: it.productName,
            sku: it.sku,
            quantity: it.quantity,
            unit_price: it.unitPrice,
            tax_rate: it.taxRate,
            tax_amount: it.taxAmount,
            line_total: it.refundAmount,
        }));

        return successResponse(
            {
                creditNote: formatCreditNoteResponse(virtualCn, {
                    items: cnItems,
                    customer: ret.customer,
                    returnNumber: rawReturn.return_number,
                    orderNumber: ret.orderNumber,
                }),
            },
            `Credit note ${cnNumber} issued successfully`,
            201
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while creating the credit note.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


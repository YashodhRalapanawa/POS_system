import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../lib/responses/index.js";
import {
    formatPaymentResponse,
    processInvoicePayment,
} from "../../../lib/payments/paymentService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments
 * Lists payments for the authenticated store with optional filtering by method, status, orderId, or invoiceId.
 */
export async function GET(request) {
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

        const url = new URL(request.url);
        const orderIdFilter = (url.searchParams.get("orderId") || "").trim();
        const invoiceIdFilter = (url.searchParams.get("invoiceId") || "").trim();
        const methodFilter = (url.searchParams.get("method") || url.searchParams.get("paymentMethod") || "").trim();
        const statusFilter = (url.searchParams.get("status") || url.searchParams.get("paymentStatus") || "").trim();
        const requestedStoreId = (url.searchParams.get("storeId") || "").trim();
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
        const offset = (page - 1) * limit;

        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        let effectiveStoreId = authStoreId;
        if (isAdmin && requestedStoreId && requestedStoreId !== "All" && requestedStoreId !== "All Stores") {
            effectiveStoreId = requestedStoreId;
        }

        const admin = getSupabaseAdmin();

        let query = admin
            .from("payments")
            .select(
                `
                *,
                order:orders (id, order_number, status, total_amount),
                processor:users (id, full_name, username)
            `,
                { count: "exact" }
            );

        if (effectiveStoreId) {
            query = query.eq("store_id", effectiveStoreId);
        }
        if (orderIdFilter) {
            query = query.eq("order_id", orderIdFilter);
        }
        if (methodFilter && methodFilter !== "All" && methodFilter !== "All Payment Methods") {
            query = query.ilike("payment_method", methodFilter);
        }
        if (statusFilter && statusFilter !== "All" && statusFilter !== "All Status") {
            const dbStatus = statusFilter.toUpperCase() === "PAID" ? "Completed" : statusFilter;
            query = query.ilike("payment_status", dbStatus);
        }

        // If invoiceIdFilter is passed, resolve the invoice's order_id so it works even before invoice_id backfill
        if (invoiceIdFilter) {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceIdFilter);
            const col = isUuid ? "id" : "invoice_number";
            const { data: invMatch } = await admin
                .from("invoices")
                .select("id, order_id")
                .eq(col, invoiceIdFilter)
                .maybeSingle();

            if (!invMatch) {
                return successResponse({ payments: [], pagination: { page, limit, total: 0, totalPages: 1 } });
            }
            query = query.eq("order_id", invMatch.order_id);
        }

        query = query
            .order("processed_at", { ascending: false })
            .range(offset, offset + limit - 1);

        const { data: rows, count, error } = await query;
        if (error) {
            return errorResponse(`Failed to retrieve payments: ${error.message}`, 500);
        }

        const formatted = (rows || []).map((p) => formatPaymentResponse(p));
        const total = count ?? formatted.length;
        const totalPages = Math.ceil(total / limit) || 1;

        return successResponse(
            {
                payments: formatted,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasMore: page < totalPages,
                },
            },
            "Payments retrieved successfully"
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while fetching payments.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

/**
 * POST /api/payments
 * Records a payment against an invoice (or order) and completes the financial side of the POS sale.
 *
 * Requirements (Developer 2 - Stage 2):
 *  - Support CASH, CARD, BANK TRANSFER, and OTHER methods
 *  - Validate payment amount against invoice balance (reject invalid under/over-payment)
 *  - Support payment status (PENDING, PAID / Completed, FAILED)
 *  - Prevent a failed or pending payment from marking the invoice/sale as paid
 *  - Coordinate the final sale event with Developer 1 so inventory is deducted exactly once
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "payments.create",
            "payments.manage",
            "pos.use",
            "pos_orders.complete",
            "pos_orders.create",
            "invoices.manage",
            "orders.manage",
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

        const invoiceId = (body.invoiceId || body.invoice_id || "").trim() || null;
        const orderId = (body.orderId || body.order_id || "").trim() || null;

        if (!invoiceId && !orderId) {
            return errorResponse("Either invoiceId or orderId is required to record a payment.", 400);
        }

        const method = body.paymentMethod || body.payment_method || body.method || "Cash";
        const amount = body.amount ?? body.paymentAmount ?? body.payment_amount;
        const tenderedAmount = body.tenderedAmount ?? body.tendered_amount ?? body.cashTendered;
        const status = body.paymentStatus || body.payment_status || body.status || "Completed";
        const reference = body.reference || body.transactionReference || "";
        const notes = body.notes || "";
        const allowPartial = Boolean(body.allowPartial ?? body.allow_partial ?? false);

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const scopedStoreId = isAdmin ? null : authStoreId;

        const result = await processInvoicePayment(admin, {
            invoiceId,
            orderId,
            storeId: scopedStoreId,
            userId: auth.user.id,
            method,
            amount,
            tenderedAmount,
            status,
            reference,
            notes,
            allowPartial,
        });

        if (result.error) {
            return errorResponse(
                result.error,
                result.status || 400,
                result.invoice ? { invoice: result.invoice } : {}
            );
        }

        return successResponse(
            {
                payment: result.payment,
                invoice: result.invoice,
                saleCompleted: result.saleCompleted,
                stockDeducted: result.stockDeducted,
            },
            result.saleCompleted
                ? `Payment of ${result.payment.amount.toFixed(2)} completed via ${result.payment.paymentMethod}. Invoice ${result.invoice.invoiceNumber} is now Paid.`
                : `Payment recorded with status "${result.payment.status}".`,
            201
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while processing the payment.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


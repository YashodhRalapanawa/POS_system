import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../lib/responses/index.js";
import {
    formatReturnResponse,
    createCustomerReturn,
} from "../../../lib/returns/returnService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/returns
 * Lists customer returns with filtering by status, refund method, reason, date, and search.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "returns.view",
            "returns.create",
            "returns.process",
            "pos.use",
            "orders.view",
            "invoices.view",
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
        const statusFilter = (url.searchParams.get("status") || "").trim();
        const refundMethodFilter = (url.searchParams.get("refundMethod") || "").trim();
        const reasonFilter = (url.searchParams.get("reason") || "").trim();
        const dateFilter = (url.searchParams.get("date") || url.searchParams.get("dateFilter") || "").trim();
        const startDate = url.searchParams.get("startDate");
        const endDate = url.searchParams.get("endDate");
        const requestedStoreId = (url.searchParams.get("storeId") || "").trim();
        const isAllRequested = url.searchParams.get("all") === "true";

        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
        const limit = isAllRequested
            ? 500
            : Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10) || 50));
        const offset = (page - 1) * limit;

        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        let effectiveStoreId = authStoreId;
        if (isAdmin && requestedStoreId && requestedStoreId !== "All" && requestedStoreId !== "All Stores") {
            effectiveStoreId = requestedStoreId;
        }

        const admin = getSupabaseAdmin();

        let query = admin
            .from("returns")
            .select(`
                *,
                customer:customers (id, name, code, phone, email),
                order:orders (id, order_number, status, total_amount),
                return_items (*)
            `, { count: "exact" });

        if (effectiveStoreId) {
            query = query.eq("store_id", effectiveStoreId);
        }

        if (statusFilter && statusFilter !== "All Status" && statusFilter !== "All") {
            query = query.ilike("status", statusFilter);
        }

        if (refundMethodFilter && refundMethodFilter !== "All Refund Methods" && refundMethodFilter !== "All") {
            query = query.ilike("refund_method", refundMethodFilter);
        }

        if (reasonFilter && reasonFilter !== "All Reasons" && reasonFilter !== "All") {
            query = query.ilike("reason", reasonFilter);
        }

        if (search) {
            const clean = search.replace(/[%_,]/g, "");
            if (clean) {
                query = query.or(`return_number.ilike.%${clean}%,notes.ilike.%${clean}%`);
            }
        }

        // Date filter
        const now = new Date();
        if (startDate) {
            query = query.gte("created_at", new Date(startDate).toISOString());
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query = query.lte("created_at", end.toISOString());
        }

        if (!startDate && !endDate && dateFilter) {
            if (dateFilter === "Today") {
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                query = query.gte("created_at", todayStart.toISOString());
            } else if (dateFilter === "Last 7 Days") {
                const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                query = query.gte("created_at", sevenDaysAgo.toISOString());
            } else if (dateFilter === "Last 30 Days") {
                const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                query = query.gte("created_at", thirtyDaysAgo.toISOString());
            }
        }

        query = query
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);

        const { data: rows, count, error } = await query;
        if (error) {
            return errorResponse(`Failed to retrieve returns: ${error.message}`, 500);
        }

        const formattedReturns = (rows || []).map((row) => {
            const creditNote = Array.isArray(row.credit_notes) ? row.credit_notes[0] : row.credit_notes;
            return formatReturnResponse(row, {
                order: row.order,
                customer: row.customer,
                items: row.return_items,
                creditNote,
            });
        });

        const total = count ?? formattedReturns.length;
        const totalPages = Math.ceil(total / limit) || 1;

        return successResponse(
            {
                returns: formattedReturns,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasMore: page < totalPages,
                },
            },
            "Returns retrieved successfully"
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while fetching returns.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

/**
 * POST /api/returns
 * Creates a new return request.
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "returns.create",
            "returns.view",
            "pos.use",
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

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const targetStoreId = isAdmin && body.storeId ? body.storeId : authStoreId;

        const result = await createCustomerReturn(admin, {
            storeId: targetStoreId,
            userId: auth.user.id,
            orderId: body.orderId || body.order_id,
            invoiceId: body.invoiceId || body.invoice_id,
            reason: body.reason,
            refundMethod: body.refundMethod || body.refund_method || "Original Payment",
            notes: body.notes || "",
            items: body.items || [],
        });

        if (result.error) {
            return errorResponse(result.error, result.status || 400);
        }

        return successResponse(
            { return: result.returnRecord },
            `Return ${result.returnRecord.returnNumber} created successfully`,
            201
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while creating the return.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


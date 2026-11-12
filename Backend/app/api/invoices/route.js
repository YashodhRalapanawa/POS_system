import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../lib/responses/index.js";
import {
    formatInvoiceResponse,
    generateInvoiceFromOrder,
} from "../../../lib/invoices/invoiceService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/invoices
 * Lists invoices for the authenticated user's store with search, filtering, and pagination.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "invoices.view",
            "invoices.manage",
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

        const url = new URL(request.url);
        const search = (url.searchParams.get("search") || url.searchParams.get("q") || "").trim();
        const statusFilter = (url.searchParams.get("status") || "").trim();
        const paymentMethodFilter = (url.searchParams.get("paymentMethod") || "").trim();
        const customerTypeFilter = (url.searchParams.get("customerType") || "").trim();
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
            .from("invoices")
            .select(
                `
                *,
                customer:customers (id, name, code, customer_type, phone, email, address, city, country, is_walk_in),
                store:stores (id, name, code),
                order:orders (
                    id, order_number, store_id, status, currency_code, currency, notes,
                    order_items (
                        id, order_id, product_id, product_name, sku, quantity,
                        unit_price, unit_cost, discount_amount, tax_rate, tax_amount, line_total
                    ),
                    payments (
                        id, order_id, payment_method, payment_status, amount,
                        tendered_amount, change_amount, reference, processed_by, processed_at
                    )
                )
            `,
                { count: "exact" }
            );

        if (effectiveStoreId) {
            query = query.eq("store_id", effectiveStoreId);
        }

        if (statusFilter && statusFilter !== "All Status" && statusFilter !== "All") {
            query = query.ilike("status", statusFilter);
        }

        if (customerTypeFilter && customerTypeFilter !== "All Customer Types" && customerTypeFilter !== "All") {
            query = query.ilike("customer_type", customerTypeFilter);
        }

        if (search) {
            const cleanSearch = search.replace(/[%_,]/g, "");
            if (cleanSearch) {
                query = query.or(
                    `invoice_number.ilike.%${cleanSearch}%,customer_name.ilike.%${cleanSearch}%,customer_code.ilike.%${cleanSearch}%`
                );
            }
        }

        // Date filtering
        const now = new Date();
        if (startDate) {
            query = query.gte("invoice_date", new Date(startDate).toISOString());
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query = query.lte("invoice_date", end.toISOString());
        }

        if (!startDate && !endDate && dateFilter) {
            if (dateFilter === "Today") {
                const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                query = query.gte("invoice_date", todayStart.toISOString());
            } else if (dateFilter === "Last 7 Days") {
                const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                query = query.gte("invoice_date", sevenDaysAgo.toISOString());
            } else if (dateFilter === "Last 30 Days") {
                const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                query = query.gte("invoice_date", thirtyDaysAgo.toISOString());
            }
        }

        query = query
            .order("invoice_date", { ascending: false })
            .range(offset, offset + limit - 1);

        const { data: rows, count, error } = await query;

        if (error) {
            return errorResponse(`Failed to retrieve invoices: ${error.message}`, 500);
        }

        // Load invoice_items if table exists for returned invoices
        const invoiceIds = (rows || []).map((r) => r.id);
        const itemsByInvoiceMap = new Map();

        if (invoiceIds.length > 0) {
            const { data: invItemsRows, error: invItemsErr } = await admin
                .from("invoice_items")
                .select("*")
                .in("invoice_id", invoiceIds);

            if (!invItemsErr && Array.isArray(invItemsRows)) {
                for (const item of invItemsRows) {
                    const list = itemsByInvoiceMap.get(item.invoice_id) || [];
                    list.push(item);
                    itemsByInvoiceMap.set(item.invoice_id, list);
                }
            }
        }

        let formattedInvoices = (rows || []).map((inv) =>
            formatInvoiceResponse(inv, {
                order: inv.order,
                customer: inv.customer,
                store: inv.store,
                items: itemsByInvoiceMap.get(inv.id) || inv.order?.order_items || [],
                payments: inv.order?.payments || [],
            })
        );

        if (paymentMethodFilter && paymentMethodFilter !== "All Payment Methods" && paymentMethodFilter !== "All") {
            formattedInvoices = formattedInvoices.filter(
                (inv) => inv.paymentMethod.toLowerCase() === paymentMethodFilter.toLowerCase()
            );
        }

        const total = count ?? formattedInvoices.length;
        const totalPages = Math.ceil(total / limit) || 1;

        return successResponse(
            {
                invoices: formattedInvoices,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasMore: page < totalPages,
                },
            },
            "Invoices retrieved successfully"
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while fetching invoices.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

/**
 * POST /api/invoices
 * Generates a new invoice from a valid POS order.
 * Recalculates tax and totals on the backend from trusted order/product data.
 * Prevents duplicate invoice generation for the same order unless `allowExisting: true`.
 */
export async function POST(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "invoices.create",
            "invoices.manage",
            "invoices.view",
            "pos.use",
            "pos_orders.create",
            "pos_orders.complete",
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

        const orderId = (body.orderId || body.order_id || "").trim();
        if (!orderId) {
            return errorResponse("Order ID is required to generate an invoice.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const targetStoreId = isAdmin && body.storeId ? body.storeId : authStoreId;

        // Allow lookup by either UUID or order_number (e.g. "ORD-1001")
        let resolvedOrderUuid = orderId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        if (!isUuid) {
            let ordQuery = admin.from("orders").select("id").eq("order_number", orderId);
            if (targetStoreId) {
                ordQuery = ordQuery.eq("store_id", targetStoreId);
            }
            const { data: ordMatch } = await ordQuery.maybeSingle();
            if (!ordMatch) {
                return errorResponse(`Order "${orderId}" was not found.`, 404);
            }
            resolvedOrderUuid = ordMatch.id;
        }

        const result = await generateInvoiceFromOrder(admin, {
            orderId: resolvedOrderUuid,
            storeId: isAdmin ? null : authStoreId,
            userId: auth.user.id,
            discountType: body.discountType ?? body.discount_type,
            discountValue: body.discountValue ?? body.discount_value,
            dueDate: body.dueDate ?? body.due_date,
            notes: body.notes,
            allowExisting: Boolean(body.allowExisting ?? body.allow_existing ?? false),
        });

        if (result.error) {
            return errorResponse(result.error, result.status || 400, result.invoice ? { invoice: result.invoice } : {});
        }

        return successResponse(
            {
                invoice: result.invoice,
                isDuplicate: Boolean(result.isDuplicate),
            },
            result.isDuplicate
                ? `Invoice ${result.invoice.invoiceNumber} already exists for this order`
                : `Invoice ${result.invoice.invoiceNumber} generated successfully`,
            result.status || 201
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while generating the invoice.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


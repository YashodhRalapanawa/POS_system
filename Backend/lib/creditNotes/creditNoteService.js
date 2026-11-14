import { roundCurrency } from "../tax/taxCalculator.js";

/**
 * Credit Note Service (Developer 2 - Stage 3.1)
 */

export function formatCreditNoteResponse(cn, extra = {}) {
    if (!cn) return null;

    const items = extra.items || cn.credit_note_items || [];
    const customer = extra.customer || cn.customer || null;

    return {
        id: cn.id,
        creditNoteNumber: cn.credit_note_number,
        storeId: cn.store_id,
        returnId: cn.return_id,
        returnNumber: extra.returnNumber || cn.return?.return_number || "",
        invoiceId: cn.invoice_id,
        invoiceNumber: extra.invoiceNumber || cn.invoice?.invoice_number || "",
        orderId: cn.order_id,
        orderNumber: extra.orderNumber || cn.order?.order_number || "",
        customerId: cn.customer_id,
        customerName: customer?.name || cn.customer_name || "Walk-in Customer",
        customerCode: customer?.code || "CUS-001",
        issueDate: cn.issue_date || cn.created_at,
        reason: cn.reason || "",
        refundMethod: cn.refund_method || "Original Payment",
        subtotal: roundCurrency(cn.subtotal),
        tax: roundCurrency(cn.tax_amount),
        taxAmount: roundCurrency(cn.tax_amount),
        total: roundCurrency(cn.total_amount),
        totalAmount: roundCurrency(cn.total_amount),
        remainingAmount: roundCurrency(cn.remaining_amount),
        status: cn.status || "Issued",
        notes: cn.notes || "",
        issuedBy: cn.issued_by,
        items: items.map((it) => ({
            id: it.id,
            creditNoteId: it.credit_note_id || cn.id,
            productId: it.product_id,
            name: it.product_name,
            productName: it.product_name,
            sku: it.sku,
            quantity: Number(it.quantity || 1),
            unitPrice: roundCurrency(it.unit_price),
            taxRate: Number(it.tax_rate || 0),
            taxAmount: roundCurrency(it.tax_amount),
            lineTotal: roundCurrency(it.line_total),
        })),
        createdAt: cn.created_at,
        updatedAt: cn.updated_at,
    };
}

/**
 * Retrieves credit notes with customer, return, invoice and order references.
 */
export async function getCreditNotesList(admin, {
    storeId,
    search = "",
    status = "",
    page = 1,
    limit = 50,
}) {
    const offset = (page - 1) * limit;

    let query = admin
        .from("returns")
        .select(`
            *,
            customer:customers (id, name, code, phone, email),
            order:orders (id, order_number),
            return_items (*)
        `, { count: "exact" })
        .eq("status", "Completed");

    if (storeId) {
        query = query.eq("store_id", storeId);
    }

    if (search) {
        const clean = search.replace(/[%_,]/g, "");
        if (clean) {
            query = query.or(`return_number.ilike.%${clean}%,notes.ilike.%${clean}%`);
        }
    }

    query = query
        .order("completed_at", { ascending: false })
        .range(offset, offset + limit - 1);

    const { data: rows, count, error } = await query;
    if (error) {
        return { creditNotes: [], total: 0, error };
    }

    const formatted = (rows || []).map((ret) => {
        const cnNumber = `CN-${String(ret.return_number || "").replace(/^RET-?/i, "")}`;
        return formatCreditNoteResponse(
            {
                id: ret.id,
                credit_note_number: cnNumber,
                store_id: ret.store_id,
                return_id: ret.id,
                invoice_id: null,
                order_id: ret.order_id,
                customer_id: ret.customer_id,
                issue_date: ret.completed_at || ret.created_at,
                reason: ret.reason,
                refund_method: ret.refund_method,
                subtotal: ret.subtotal,
                tax_amount: ret.tax_amount,
                total_amount: ret.refund_amount,
                remaining_amount: ret.refund_amount,
                status: "Issued",
                notes: ret.notes,
                issued_by: ret.processed_by || ret.requested_by,
                created_at: ret.completed_at || ret.created_at,
                updated_at: ret.updated_at,
            },
            {
                customer: ret.customer,
                returnNumber: ret.return_number,
                orderNumber: ret.order?.order_number,
                items: (ret.return_items || []).map((ri) => ({
                    ...ri,
                    line_total: roundCurrency(Number(ri.refund_amount || 0) + Number(ri.tax_amount || 0)),
                })),
            }
        );
    });

    return {
        creditNotes: formatted,
        total: count ?? formatted.length,
        error: null,
    };
}

/**
 * Retrieves a single credit note by ID, return_number, or credit_note_number.
 */
export async function getCreditNoteById(admin, idOrNumber, storeId = null) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrNumber);
    const normalizedParam = isUuid
        ? idOrNumber
        : String(idOrNumber).replace(/^CN-?/i, "RET-");
    const col = isUuid ? "id" : "return_number";

    let query = admin
        .from("returns")
        .select(`
            *,
            customer:customers (id, name, code, phone, email, address, city, country),
            order:orders (id, order_number),
            return_items (*)
        `)
        .eq(col, normalizedParam);

    if (storeId) {
        query = query.eq("store_id", storeId);
    }

    const { data: ret, error } = await query.maybeSingle();
    if (error || !ret) {
        return { creditNote: null, error: error || "Credit note not found" };
    }

    const cnNumber = `CN-${String(ret.return_number || "").replace(/^RET-?/i, "")}`;
    return {
        creditNote: formatCreditNoteResponse(
            {
                id: ret.id,
                credit_note_number: cnNumber,
                store_id: ret.store_id,
                return_id: ret.id,
                invoice_id: null,
                order_id: ret.order_id,
                customer_id: ret.customer_id,
                issue_date: ret.completed_at || ret.created_at,
                reason: ret.reason,
                refund_method: ret.refund_method,
                subtotal: ret.subtotal,
                tax_amount: ret.tax_amount,
                total_amount: ret.refund_amount,
                remaining_amount: ret.refund_amount,
                status: "Issued",
                notes: ret.notes,
                issued_by: ret.processed_by || ret.requested_by,
                created_at: ret.completed_at || ret.created_at,
                updated_at: ret.updated_at,
            },
            {
                customer: ret.customer,
                returnNumber: ret.return_number,
                orderNumber: ret.order?.order_number,
                items: (ret.return_items || []).map((ri) => ({
                    ...ri,
                    line_total: roundCurrency(Number(ri.refund_amount || 0) + Number(ri.tax_amount || 0)),
                })),
            }
        ),
        error: null,
    };
}


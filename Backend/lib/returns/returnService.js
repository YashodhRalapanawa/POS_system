import { roundCurrency, calculateReturnItemFinancials } from "../tax/taxCalculator.js";
import { fetchInvoiceWithDetails } from "../invoices/invoiceService.js";

/**
 * Return Service (Developer 2 - Stage 3.1)
 */

export const ALLOWED_RETURN_REASONS = [
    "Damaged",
    "Defective",
    "Wrong Item",
    "Customer Changed Mind",
    "Incorrect Quantity",
    "Other",
];

export const ALLOWED_REFUND_METHODS = [
    "Original Payment",
    "Cash",
    "Card",
    "Bank Transfer",
    "Store Credit",
];

export const ALLOWED_RETURN_STATUSES = ["Pending", "Approved", "Completed", "Rejected"];

/**
 * Formats a return database record into consistent frontend API response.
 */
export function formatReturnResponse(returnRecord, options = {}) {
    if (!returnRecord) return null;

    const order = options.order || returnRecord.order || null;
    const customer = options.customer || returnRecord.customer || order?.customer || null;
    const rawItems = options.items || returnRecord.return_items || returnRecord.items || [];
    const creditNote = options.creditNote || returnRecord.credit_notes || null;

    const formattedItems = rawItems.map((it) => {
        const qty = Number(it.quantity || 1);
        const unitPrice = roundCurrency(it.unit_price ?? it.unitPrice ?? 0);
        const taxRate = Number(it.tax_rate ?? it.taxRate ?? 0);
        const taxAmount = roundCurrency(it.tax_amount ?? it.taxAmount ?? 0);
        const refundAmount = roundCurrency(it.refund_amount ?? it.refundAmount ?? (qty * unitPrice));

        return {
            id: it.id,
            returnId: it.return_id || returnRecord.id,
            orderItemId: it.order_item_id || it.orderItemId,
            productId: it.product_id || it.productId,
            name: it.product_name || it.productName || it.name || "Item",
            productName: it.product_name || it.productName || it.name || "Item",
            sku: it.sku || "",
            quantity: qty,
            unitPrice,
            taxRate,
            taxAmount,
            refundAmount,
            restock: it.restock !== false,
            createdAt: it.created_at,
        };
    });

    const subtotal = roundCurrency(returnRecord.subtotal ?? 0);
    const tax = roundCurrency(returnRecord.tax_amount ?? returnRecord.tax ?? 0);
    const refundAmount = roundCurrency(returnRecord.refund_amount ?? (subtotal + tax));

    return {
        id: returnRecord.return_number || returnRecord.id,
        returnId: returnRecord.id,
        returnNumber: returnRecord.return_number || returnRecord.id,
        storeId: returnRecord.store_id,
        orderId: order?.order_number || returnRecord.order_id,
        orderUuid: returnRecord.order_id,
        orderNumber: order?.order_number || "",
        invoiceId: returnRecord.invoice_id || null,
        customerId: returnRecord.customer_id || customer?.id || null,
        customerName: customer?.name || returnRecord.customer_name || "Walk-in Customer",
        customerCode: customer?.code || "CUS-001",
        customerPhone: customer?.phone || "",
        customerEmail: customer?.email || "",
        reason: returnRecord.reason || "Other",
        notes: returnRecord.notes || "",
        refundMethod: returnRecord.refund_method || "Original Payment",
        status: returnRecord.status || "Pending",
        subtotal,
        tax,
        taxAmount: tax,
        refundAmount,
        totalRefund: refundAmount,
        requestedBy: returnRecord.requested_by,
        approvedBy: returnRecord.approved_by,
        approvedAt: returnRecord.approved_at,
        processedBy: returnRecord.processed_by,
        completedAt: returnRecord.completed_at,
        rejectedBy: returnRecord.rejected_by,
        rejectedAt: returnRecord.rejected_at,
        rejectionReason: returnRecord.rejection_reason || null,
        itemsCount: formattedItems.reduce((acc, curr) => acc + curr.quantity, 0),
        items: formattedItems,
        creditNoteId: creditNote?.id || null,
        creditNoteNumber: creditNote?.credit_note_number || null,
        createdAt: returnRecord.created_at,
        updatedAt: returnRecord.updated_at,
    };
}

/**
 * Fetches return with order, customer, items, and credit notes.
 */
export async function fetchReturnWithDetails(admin, column, value, storeId = null) {
    let query = admin
        .from("returns")
        .select(`
            *,
            customer:customers (id, name, code, phone, email, address, city, country),
            order:orders (
                id, order_number, store_id, status, subtotal, total_amount, currency_code, currency,
                order_items (id, product_id, product_name, sku, quantity, unit_price, tax_rate, tax_amount, line_total)
            ),
            return_items (*),
            credit_notes (id, credit_note_number, total_amount, status)
        `)
        .eq(column, value);

    if (storeId) {
        query = query.eq("store_id", storeId);
    }

    const { data: returnRow, error } = await query.maybeSingle();
    if (error || !returnRow) {
        return { returnRecord: null, error };
    }

    const creditNote = Array.isArray(returnRow.credit_notes) ? returnRow.credit_notes[0] : returnRow.credit_notes;

    return {
        returnRecord: formatReturnResponse(returnRow, {
            order: returnRow.order,
            customer: returnRow.customer,
            items: returnRow.return_items,
            creditNote,
        }),
        rawReturn: returnRow,
        error: null,
    };
}

/**
 * Validates returnable quantities and creates Return and ReturnItems.
 */
export async function createCustomerReturn(admin, {
    storeId,
    userId,
    orderId,
    invoiceId,
    reason,
    refundMethod = "Original Payment",
    notes = "",
    items = [],
}) {
    if (!orderId && !invoiceId) {
        return { error: "Either orderId or invoiceId is required.", status: 400 };
    }

    if (!Array.isArray(items) || items.length === 0) {
        return { error: "At least one item must be selected for return.", status: 400 };
    }

    if (!ALLOWED_RETURN_REASONS.includes(reason)) {
        return {
            error: `Invalid return reason "${reason}". Allowed reasons: ${ALLOWED_RETURN_REASONS.join(", ")}.`,
            status: 400,
        };
    }

    if (!ALLOWED_REFUND_METHODS.includes(refundMethod)) {
        return {
            error: `Invalid refund method "${refundMethod}". Allowed methods: ${ALLOWED_REFUND_METHODS.join(", ")}.`,
            status: 400,
        };
    }

    // Resolve order
    let targetOrderId = orderId;
    let resolvedInvoiceId = invoiceId;

    if (resolvedInvoiceId && !targetOrderId) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedInvoiceId);
        const col = isUuid ? "id" : "invoice_number";
        const { data: invRow } = await admin.from("invoices").select("id, order_id, store_id").eq(col, resolvedInvoiceId).maybeSingle();
        if (!invRow) {
            return { error: `Invoice "${resolvedInvoiceId}" not found.`, status: 404 };
        }
        targetOrderId = invRow.order_id;
        resolvedInvoiceId = invRow.id;
    }

    const isOrderUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetOrderId);
    const orderCol = isOrderUuid ? "id" : "order_number";

    let orderQuery = admin
        .from("orders")
        .select(`
            id, order_number, store_id, customer_id, status, subtotal, tax_amount, total_amount,
            order_items (id, product_id, product_name, sku, quantity, unit_price, tax_rate, tax_amount, line_total)
        `)
        .eq(orderCol, targetOrderId);

    if (storeId) {
        orderQuery = orderQuery.eq("store_id", storeId);
    }

    const { data: order, error: ordErr } = await orderQuery.maybeSingle();
    if (ordErr || !order) {
        return { error: `Original order "${targetOrderId}" not found.`, status: 404 };
    }

    const effectiveStoreId = order.store_id;

    if (!resolvedInvoiceId) {
        const { data: invRow } = await admin.from("invoices").select("id").eq("order_id", order.id).maybeSingle();
        if (invRow) resolvedInvoiceId = invRow.id;
    }

    const orderItems = order.order_items || [];
    if (orderItems.length === 0) {
        return { error: `Order ${order.order_number} has no items.`, status: 400 };
    }

    // Check existing non-rejected returns for this order to compute already returned quantities
    const { data: existingReturns } = await admin
        .from("returns")
        .select(`
            id, status,
            return_items (order_item_id, product_id, quantity)
        `)
        .eq("order_id", order.id)
        .neq("status", "Rejected");

    const alreadyReturnedMap = new Map();
    (existingReturns || []).forEach((ret) => {
        (ret.return_items || []).forEach((ri) => {
            const current = alreadyReturnedMap.get(ri.order_item_id) || 0;
            alreadyReturnedMap.set(ri.order_item_id, current + Number(ri.quantity || 0));
        });
    });

    // Validate requested items
    const orderItemMap = new Map();
    orderItems.forEach((oi) => {
        orderItemMap.set(oi.id, oi);
        if (oi.product_id) orderItemMap.set(oi.product_id, oi);
    });

    const preparedReturnItems = [];
    let calculatedSubtotal = 0;
    let calculatedTax = 0;

    for (const itemInput of items) {
        const requestedQty = parseInt(itemInput.quantity ?? itemInput.returnQty, 10);
        if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
            return { error: "Return quantity must be a positive integer.", status: 400 };
        }

        const matchId = itemInput.orderItemId || itemInput.id || itemInput.productId;
        const origItem = orderItemMap.get(matchId);

        if (!origItem) {
            return {
                error: `Item "${itemInput.name || matchId}" is not part of original order ${order.order_number}.`,
                status: 400,
            };
        }

        const purchasedQty = Number(origItem.quantity || 1);
        const alreadyReturned = alreadyReturnedMap.get(origItem.id) || 0;
        const returnableQty = purchasedQty - alreadyReturned;

        if (requestedQty > returnableQty) {
            return {
                error: `Requested return quantity (${requestedQty}) exceeds remaining returnable quantity (${returnableQty}) for "${origItem.product_name}".`,
                status: 400,
            };
        }

        // Calculate item return financials
        const fin = calculateReturnItemFinancials({
            originalItem: origItem,
            returnQuantity: requestedQty,
        });

        // Damaged or Defective typically do not restock; other reasons do
        const defaultRestock = !["Damaged", "Defective"].includes(reason);
        const shouldRestock = typeof itemInput.restock === "boolean" ? itemInput.restock : defaultRestock;

        preparedReturnItems.push({
            store_id: effectiveStoreId,
            order_item_id: origItem.id,
            product_id: origItem.product_id,
            product_name: origItem.product_name,
            sku: origItem.sku,
            quantity: requestedQty,
            unit_price: origItem.unit_price,
            tax_rate: fin.taxRate,
            tax_amount: fin.taxAmount,
            refund_amount: fin.refundSubtotal,
            restock: shouldRestock,
        });

        calculatedSubtotal = roundCurrency(calculatedSubtotal + fin.refundSubtotal);
        calculatedTax = roundCurrency(calculatedTax + fin.taxAmount);

        // Update local alreadyReturnedMap to prevent duplicate lines in same request
        alreadyReturnedMap.set(origItem.id, alreadyReturned + requestedQty);
    }

    const totalRefundAmount = roundCurrency(calculatedSubtotal + calculatedTax);

    // Document number from store_settings via next_document_number RPC
    let returnNumber = null;
    const { data: nextNum } = await admin.rpc("next_document_number", {
        p_store_id: effectiveStoreId,
        p_kind: "return",
    });
    if (nextNum) returnNumber = nextNum;

    // Insert Return record
    const { data: insertedReturn, error: insertErr } = await admin
        .from("returns")
        .insert({
            store_id: effectiveStoreId,
            order_id: order.id,
            customer_id: order.customer_id,
            invoice_id: resolvedInvoiceId || null,
            ...(returnNumber ? { return_number: returnNumber } : {}),
            reason,
            refund_method: refundMethod,
            notes: String(notes || "").trim(),
            subtotal: calculatedSubtotal,
            tax_amount: calculatedTax,
            refund_amount: totalRefundAmount,
            status: "Pending",
            requested_by: userId,
            created_at: new Date().toISOString(),
        })
        .select("*")
        .single();

    if (insertErr || !insertedReturn) {
        return { error: `Failed to create return record: ${insertErr?.message || "Unknown error"}`, status: 500 };
    }

    // Insert Return Items
    const itemsToInsert = preparedReturnItems.map((it) => ({
        ...it,
        return_id: insertedReturn.id,
    }));

    const { error: itemsErr } = await admin.from("return_items").insert(itemsToInsert);
    if (itemsErr) {
        await admin.from("returns").delete().eq("id", insertedReturn.id);
        return { error: `Failed to save return items: ${itemsErr.message}`, status: 500 };
    }

    const result = await fetchReturnWithDetails(admin, "id", insertedReturn.id, effectiveStoreId);
    return {
        returnRecord: result.returnRecord,
        status: 201,
    };
}

/**
 * Transitions return status:
 *  - Pending -> Approved
 *  - Pending/Approved -> Rejected (requires rejectionReason)
 *  - Approved -> Completed (triggers restock + generates Credit Note)
 */
export async function updateReturnStatus(admin, {
    returnId,
    storeId,
    userId,
    status,
    rejectionReason = "",
    notes = "",
}) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(returnId);
    const col = isUuid ? "id" : "return_number";

    const { returnRecord: current, rawReturn, error: findErr } = await fetchReturnWithDetails(admin, col, returnId, storeId);
    if (findErr || !current || !rawReturn) {
        return { error: "Return record not found.", status: 404 };
    }

    const nextStatus = status;
    if (!ALLOWED_RETURN_STATUSES.includes(nextStatus)) {
        return {
            error: `Invalid status "${nextStatus}". Allowed values: ${ALLOWED_RETURN_STATUSES.join(", ")}.`,
            status: 400,
        };
    }

    const currentStatus = current.status;
    if (currentStatus === nextStatus) {
        return { returnRecord: current, status: 200 };
    }

    if (currentStatus === "Completed") {
        return { error: "Completed returns cannot be modified.", status: 400 };
    }
    if (currentStatus === "Rejected") {
        return { error: "Rejected returns cannot be modified.", status: 400 };
    }

    const nowIso = new Date().toISOString();
    const updates = {
        updated_at: nowIso,
    };

    if (nextStatus === "Approved") {
        if (currentStatus !== "Pending") {
            return { error: `Only Pending returns can be Approved. Current status: ${currentStatus}.`, status: 400 };
        }
        updates.status = "Approved";
        updates.approved_by = userId;
        updates.approved_at = nowIso;
    } else if (nextStatus === "Rejected") {
        if (!rejectionReason && !notes) {
            return { error: "A rejection reason is required to reject a return.", status: 400 };
        }
        updates.status = "Rejected";
        updates.rejected_by = userId;
        updates.rejected_at = nowIso;
        updates.rejection_reason = rejectionReason || notes;
    } else if (nextStatus === "Completed") {
        // Can complete from Approved (or directly from Pending with immediate approval)
        updates.status = "Completed";
        updates.approved_by = rawReturn.approved_by || userId;
        updates.approved_at = rawReturn.approved_at || nowIso;
        updates.processed_by = userId;
        updates.completed_at = nowIso;

        // Trigger stock restock for items with restock = true
        const itemsToRestock = (current.items || []).filter((it) => it.restock);
        if (itemsToRestock.length > 0) {
            const stockMovements = itemsToRestock.map((it) => ({
                store_id: rawReturn.store_id,
                product_id: it.productId,
                adjustment_type: "Return",
                quantity: it.quantity,
                reference_type: "return",
                reference_id: rawReturn.id,
                notes: `Return #${current.returnNumber}`,
                created_by: userId,
            }));

            await admin.from("stock_movements").insert(stockMovements);
        }

        // Auto-create or ensure Credit Note exists
        await ensureCreditNoteForReturn(admin, {
            returnRow: rawReturn,
            returnItems: current.items,
            userId,
        });
    }

    const { error: updateErr } = await admin
        .from("returns")
        .update(updates)
        .eq("id", rawReturn.id);

    if (updateErr) {
        return { error: `Failed to update return status: ${updateErr.message}`, status: 500 };
    }

    const refreshed = await fetchReturnWithDetails(admin, "id", rawReturn.id, rawReturn.store_id);
    return {
        returnRecord: refreshed.returnRecord,
        status: 200,
    };
}

/**
 * Ensures an official Credit Note record is created for a completed return.
 */
async function ensureCreditNoteForReturn(admin, { returnRow, returnItems, userId }) {
    // Check if credit note already created
    const { data: existingCn } = await admin
        .from("credit_notes")
        .select("id")
        .eq("return_id", returnRow.id)
        .maybeSingle();

    if (existingCn) return existingCn;

    const cnNumber = `CN-${returnRow.return_number?.replace(/^RET-?/i, "") || Date.now().toString().slice(-6)}`;
    const nowIso = new Date().toISOString();

    const { data: newCn, error: cnErr } = await admin
        .from("credit_notes")
        .insert({
            store_id: returnRow.store_id,
            return_id: returnRow.id,
            invoice_id: returnRow.invoice_id || null,
            order_id: returnRow.order_id,
            customer_id: returnRow.customer_id,
            credit_note_number: cnNumber,
            issue_date: nowIso,
            reason: returnRow.reason,
            refund_method: returnRow.refund_method,
            subtotal: returnRow.subtotal,
            tax_amount: returnRow.tax_amount,
            total_amount: returnRow.refund_amount,
            remaining_amount: returnRow.refund_amount,
            status: "Issued",
            notes: `Auto-generated for Return #${returnRow.return_number}`,
            issued_by: userId,
        })
        .select("id, credit_note_number")
        .single();

    if (!cnErr && newCn) {
        const cnItems = (returnItems || []).map((it) => ({
            store_id: returnRow.store_id,
            credit_note_id: newCn.id,
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
        await admin.from("credit_note_items").insert(cnItems);
    }

    return newCn;
}


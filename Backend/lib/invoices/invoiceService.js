import {
    calculateDocumentFinancials,
    getStoreTaxConfig,
    roundCurrency,
} from "../tax/taxCalculator.js";

/**
 * Shared Invoice Service & Formatting Utilities (Developer 2 - Stage 1.2)
 */

/**
 * Derives payment method and payment status summary from an array of payments.
 */
export function summarizePayments(payments = [], invoiceTotal = 0, invoiceStatus = "Pending") {
    const validPayments = Array.isArray(payments) ? payments : [];
    const completedPayments = validPayments.filter(
        (p) => String(p.payment_status || p.paymentStatus || "").toLowerCase() === "completed"
    );

    const paidAmount = roundCurrency(
        completedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    );
    const total = roundCurrency(invoiceTotal);
    const balanceDue = Math.max(0, roundCurrency(total - paidAmount));

    let paymentMethod = "Unpaid";
    if (completedPayments.length === 1) {
        paymentMethod = completedPayments[0].payment_method || completedPayments[0].paymentMethod || "Cash";
    } else if (completedPayments.length > 1) {
        const distinctMethods = new Set(
            completedPayments.map((p) => p.payment_method || p.paymentMethod || "Cash")
        );
        paymentMethod = distinctMethods.size === 1 ? Array.from(distinctMethods)[0] : "Mixed";
    } else if (validPayments.length > 0) {
        paymentMethod = validPayments[0].payment_method || validPayments[0].paymentMethod || "Cash";
    }

    let paymentStatus = invoiceStatus || "Pending";
    if (invoiceStatus === "Cancelled" || invoiceStatus === "Refunded") {
        paymentStatus = invoiceStatus;
    } else if (paidAmount >= total && total > 0) {
        paymentStatus = "Paid";
    } else if (paidAmount > 0 && paidAmount < total) {
        paymentStatus = "Partial";
    } else {
        paymentStatus = invoiceStatus === "Paid" ? "Paid" : "Pending";
    }

    return {
        paymentMethod,
        paymentStatus,
        paidAmount,
        balanceDue,
        paymentsCount: validPayments.length,
    };
}

/**
 * Normalizes an invoice record along with its order, customer, items, and payments
 * into a consistent frontend-ready and API-standard response object.
 */
export function formatInvoiceResponse(invoice, options = {}) {
    if (!invoice) return null;

    const order = options.order || invoice.order || null;
    const customer = options.customer || invoice.customer || order?.customer || null;
    const store = options.store || invoice.store || order?.store || null;
    const rawItems =
        options.items ||
        invoice.invoice_items ||
        order?.order_items ||
        invoice.items ||
        [];
    const rawPayments =
        options.payments ||
        invoice.payments ||
        order?.payments ||
        [];

    const formattedItems = rawItems.map((it) => {
        const qty = Number(it.quantity || 1);
        const unitPrice = roundCurrency(it.unit_price ?? it.unitPrice ?? 0);
        const discountAmount = roundCurrency(it.discount_amount ?? it.discountAmount ?? 0);
        const taxRate = Number(it.tax_rate ?? it.taxRate ?? 0);
        const taxAmount = roundCurrency(it.tax_amount ?? it.taxAmount ?? 0);
        const lineTotal = roundCurrency(
            it.line_total ?? it.lineTotal ?? qty * unitPrice - discountAmount + taxAmount
        );

        return {
            id: it.id,
            invoiceId: it.invoice_id || invoice.id,
            orderItemId: it.order_item_id || it.orderItemId || it.id,
            productId: it.product_id || it.productId,
            name: it.product_name || it.productName || it.name || "",
            productName: it.product_name || it.productName || it.name || "",
            sku: it.sku || "",
            quantity: qty,
            unitPrice,
            unitCost: roundCurrency(it.unit_cost ?? it.unitCost ?? 0),
            discountAmount,
            taxRate,
            taxAmount,
            lineTotal,
        };
    });

    const subtotal = roundCurrency(invoice.subtotal ?? order?.subtotal ?? 0);
    const discountAmount = roundCurrency(invoice.discount_amount ?? invoice.discount ?? order?.discount_amount ?? 0);
    const taxAmount = roundCurrency(invoice.tax_amount ?? invoice.tax ?? order?.tax_amount ?? 0);
    const totalAmount = roundCurrency(invoice.total_amount ?? invoice.total ?? subtotal - discountAmount + taxAmount);

    // Check if overdue when Pending and past due_date
    let effectiveStatus = invoice.status || "Pending";
    if (
        effectiveStatus === "Pending" &&
        invoice.due_date &&
        new Date(invoice.due_date).getTime() < Date.now() - 24 * 60 * 60 * 1000
    ) {
        effectiveStatus = "Overdue";
    }

    const paymentSummary = summarizePayments(rawPayments, totalAmount, effectiveStatus);
    if (paymentSummary.paymentStatus === "Paid" && effectiveStatus === "Pending") {
        effectiveStatus = "Paid";
    }

    const customerAddress =
        invoice.customer_address ||
        [customer?.address, customer?.city, customer?.country].filter(Boolean).join(", ") ||
        "";

    return {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number || invoice.invoiceNumber,
        storeId: invoice.store_id || order?.store_id,
        storeName: store?.name || "",
        storeCode: store?.code || "",
        orderId: order?.order_number || invoice.order_id,
        orderUuid: invoice.order_id,
        orderNumber: order?.order_number || "",
        orderStatus: order?.status || "",
        customerId: invoice.customer_id || customer?.id || null,
        customerName: invoice.customer_name || customer?.name || "Walk-in Customer",
        customerCode: invoice.customer_code || customer?.code || "CUS-001",
        customerType: invoice.customer_type || customer?.customer_type || "Individual",
        customerPhone: invoice.customer_phone || customer?.phone || "",
        customerEmail: invoice.customer_email || customer?.email || "",
        customerAddress,
        invoiceDate: invoice.invoice_date || invoice.created_at,
        dueDate: invoice.due_date || invoice.invoice_date || invoice.created_at,
        currency: invoice.currency_code || order?.currency_code || order?.currency || "USD",
        subtotal,
        discount: discountAmount,
        discountAmount,
        tax: taxAmount,
        taxAmount,
        total: totalAmount,
        totalAmount,
        paidAmount: paymentSummary.paidAmount,
        balanceDue: paymentSummary.balanceDue,
        paymentMethod: paymentSummary.paymentMethod === "Unpaid" ? "Cash" : paymentSummary.paymentMethod,
        paymentStatus: paymentSummary.paymentStatus,
        status: effectiveStatus,
        notes: invoice.notes || order?.notes || "",
        itemCount: formattedItems.reduce((sum, it) => sum + it.quantity, 0),
        items: formattedItems,
        payments: rawPayments.map((p) => ({
            id: p.id,
            paymentMethod: p.payment_method,
            paymentStatus: p.payment_status,
            amount: roundCurrency(p.amount),
            tenderedAmount: roundCurrency(p.tendered_amount),
            changeAmount: roundCurrency(p.change_amount),
            reference: p.reference || "",
            processedBy: p.processed_by,
            processedAt: p.processed_at || p.created_at,
        })),
        createdAt: invoice.created_at,
        updatedAt: invoice.updated_at,
    };
}

/**
 * Fetches complete invoice details (with order, customer, items, and payments) by a filter column.
 */
export async function fetchInvoiceWithDetails(admin, column, value, storeId = null) {
    let query = admin
        .from("invoices")
        .select(`
            *,
            customer:customers (id, name, code, customer_type, phone, email, address, city, country, is_walk_in),
            order:orders (
                id, order_number, store_id, customer_id, cashier_user_id,
                status, discount_type, discount_value, subtotal, discount_amount, tax_amount, total_amount,
                notes, created_at, completed_at,
                store:stores (id, name, code, address, city, country, phone, email),
                order_items (
                    id, order_id, product_id, product_name, sku, quantity,
                    unit_price, unit_cost, discount_amount, tax_rate, tax_amount, line_total, created_at
                ),
                payments (
                    id, order_id, payment_method, payment_status, amount,
                    tendered_amount, change_amount, reference, processed_by, processed_at, created_at
                )
            )
        `)
        .eq(column, value);

    if (storeId) {
        query = query.eq("store_id", storeId);
    }

    const { data: invoice, error } = await query.maybeSingle();
    if (error || !invoice) {
        return { invoice: null, error };
    }

    const items = invoice.order?.order_items || [];

    return {
        invoice: formatInvoiceResponse(invoice, {
            order: invoice.order,
            customer: invoice.customer,
            store: invoice.store,
            items,
            payments: invoice.order?.payments || [],
        }),
        rawInvoice: invoice,
        error: null,
    };
}

/**
 * Generates an invoice from a valid POS order, recalculating financial totals on the backend
 * through the central tax calculation service.
 */
export async function generateInvoiceFromOrder(admin, {
    orderId,
    storeId,
    userId,
    discountType,
    discountValue,
    dueDate,
    notes,
    allowExisting = false,
}) {
    // 1. Fetch source order with items, customer, and payments
    const { data: order, error: orderErr } = await admin
        .from("orders")
        .select(`
            id, order_number, store_id, customer_id, cashier_user_id,
            status, discount_type, discount_value, subtotal, discount_amount, tax_amount, total_amount,
            notes, created_at, completed_at,
            customer:customers (id, name, code, customer_type, phone, email, address, city, country, is_walk_in),
            store:stores (id, name, code),
            order_items (
                id, order_id, product_id, product_name, sku, quantity,
                unit_price, unit_cost, discount_amount, tax_rate, tax_amount, line_total
            ),
            payments (
                id, order_id, payment_method, payment_status, amount,
                tendered_amount, change_amount, reference, processed_by, processed_at
            )
        `)
        .eq("id", orderId)
        .maybeSingle();

    if (orderErr || !order) {
        return { error: "Source order not found.", status: 404 };
    }

    if (storeId && order.store_id !== storeId) {
        return { error: "Order does not belong to your store.", status: 403 };
    }

    const targetStoreId = order.store_id;
    const orderStatus = String(order.status || "").toLowerCase();

    // Prevent generating an invoice for a cancelled order
    if (orderStatus === "cancelled") {
        return { error: `Cannot generate an invoice for cancelled order ${order.order_number}.`, status: 400 };
    }

    const orderItems = order.order_items || [];
    if (orderItems.length === 0) {
        return { error: `Order ${order.order_number} has no line items.`, status: 400 };
    }

    // 2. Check if an invoice already exists for this order (prevent duplicate invoice generation)
    const existingCheck = await fetchInvoiceWithDetails(admin, "order_id", order.id, targetStoreId);
    if (existingCheck.invoice) {
        if (allowExisting) {
            return { invoice: existingCheck.invoice, isDuplicate: true, status: 200 };
        }
        return {
            error: `An invoice (${existingCheck.invoice.invoiceNumber}) already exists for order ${order.order_number}.`,
            status: 409,
            invoice: existingCheck.invoice,
        };
    }

    // 3. Load store tax configuration & authoritative product prices/tax rates
    const taxConfig = await getStoreTaxConfig(admin, targetStoreId);

    const productIds = orderItems.map((it) => it.product_id).filter(Boolean);
    const { data: products } = await admin
        .from("products")
        .select("id, name, sku, selling_price, purchase_price, tax_rate, status")
        .eq("store_id", targetStoreId)
        .in("id", productIds);

    const productMap = new Map();
    (products || []).forEach((p) => productMap.set(p.id, p));

    // Prepare items for central tax calculation using trusted backend prices
    const itemsForCalc = orderItems.map((oi) => {
        const prod = productMap.get(oi.product_id);
        const authoritativeUnitPrice = roundCurrency(oi.unit_price ?? prod?.selling_price ?? 0);
        const authoritativeUnitCost = roundCurrency(oi.unit_cost ?? prod?.purchase_price ?? 0);
        const itemTaxRate =
            Number(oi.tax_rate) > 0
                ? Number(oi.tax_rate)
                : Number(prod?.tax_rate) > 0
                  ? Number(prod.tax_rate)
                  : taxConfig.defaultTaxRate;

        return {
            id: oi.id,
            orderItemId: oi.id,
            productId: oi.product_id,
            productName: oi.product_name || prod?.name || "Item",
            sku: oi.sku || prod?.sku || "",
            quantity: Number(oi.quantity || 1),
            unitPrice: authoritativeUnitPrice,
            unitCost: authoritativeUnitCost,
            discountAmount: Number(oi.discount_amount || 0),
            taxRate: itemTaxRate,
        };
    });

    const effectiveDiscountType =
        discountType !== undefined ? discountType : order.discount_type || null;
    const effectiveDiscountValue =
        discountValue !== undefined ? Number(discountValue) : Number(order.discount_value || 0);

    const financials = calculateDocumentFinancials({
        items: itemsForCalc,
        discountType: effectiveDiscountType,
        discountValue: effectiveDiscountValue,
        defaultTaxRate: taxConfig.defaultTaxRate,
        pricesIncludeTax: taxConfig.pricesIncludeTax,
    });

    // 4. Sync calculated tax & totals back to order and order_items so Order and Invoice match 100%
    await admin
        .from("orders")
        .update({
            discount_type: effectiveDiscountType,
            discount_value: effectiveDiscountValue,
            subtotal: financials.subtotal,
            discount_amount: financials.discountAmount,
            tax_amount: financials.taxAmount,
            total_amount: financials.totalAmount,
            updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

    for (const calcItem of financials.items) {
        if (calcItem.orderItemId) {
            await admin
                .from("order_items")
                .update({
                    discount_amount: calcItem.discountAmount,
                    tax_rate: calcItem.taxRate,
                    tax_amount: calcItem.taxAmount,
                    line_total: calcItem.lineTotal,
                })
                .eq("id", calcItem.orderItemId);
        }
    }

    // 5. Determine initial invoice status based on completed payments
    const paymentSummary = summarizePayments(order.payments || [], financials.totalAmount, "Pending");
    const initialInvoiceStatus = paymentSummary.paymentStatus === "Paid" ? "Paid" : "Pending";

    // Generate invoice number via next_document_number RPC (or trigger)
    let invoiceNumber = null;
    const { data: nextInvNum } = await admin.rpc("next_document_number", {
        p_store_id: targetStoreId,
        p_kind: "invoice",
    });
    if (nextInvNum) {
        invoiceNumber = nextInvNum;
    }

    const cust = order.customer;
    const custAddress = [cust?.address, cust?.city, cust?.country].filter(Boolean).join(", ");
    const nowIso = new Date().toISOString();

    const invoiceInsertPayload = {
        store_id: targetStoreId,
        order_id: order.id,
        customer_id: order.customer_id || cust?.id || null,
        ...(invoiceNumber ? { invoice_number: invoiceNumber } : {}),
        invoice_date: nowIso,
        due_date: dueDate ? new Date(dueDate).toISOString() : nowIso,
        customer_name: cust?.name || "Walk-in Customer",
        customer_code: cust?.code || "CUS-001",
        customer_type: cust?.customer_type === "Business" ? "Business" : "Individual",
        customer_phone: cust?.phone || "",
        customer_email: cust?.email || "",
        customer_address: custAddress,
        subtotal: financials.subtotal,
        discount_amount: financials.discountAmount,
        tax_amount: financials.taxAmount,
        total_amount: financials.totalAmount,
        status: initialInvoiceStatus,
    };

    const { data: insertedInvoice, error: insertInvErr } = await admin
        .from("invoices")
        .insert(invoiceInsertPayload)
        .select("*")
        .single();

    if (insertInvErr || !insertedInvoice) {
        if (insertInvErr?.code === "23505") {
            return {
                error: `An invoice already exists for order ${order.order_number}.`,
                status: 409,
            };
        }
        return {
            error: `Failed to generate invoice: ${insertInvErr?.message || "Unknown error"}`,
            status: 500,
        };
    }

    const invoiceItemsPayload = financials.items.map((it) => ({
        store_id: targetStoreId,
        invoice_id: insertedInvoice.id,
        order_item_id: it.orderItemId || null,
        product_id: it.productId,
        product_name: it.productName,
        sku: it.sku,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        unit_cost: it.unitCost,
        discount_amount: it.discountAmount,
        tax_rate: it.taxRate,
        tax_amount: it.taxAmount,
        line_total: it.lineTotal,
    }));

    // 7. Return full formatted invoice
    const fullResult = await fetchInvoiceWithDetails(admin, "id", insertedInvoice.id, targetStoreId);
    return {
        invoice:
            fullResult.invoice ||
            formatInvoiceResponse(insertedInvoice, {
                order,
                customer: cust,
                store: order.store,
                items: invoiceItemsPayload,
                payments: order.payments || [],
            }),
        isDuplicate: false,
        status: 201,
    };
}


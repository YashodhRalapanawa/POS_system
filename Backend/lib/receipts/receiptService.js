import { roundCurrency } from "../tax/taxCalculator.js";
import { fetchInvoiceWithDetails } from "../invoices/invoiceService.js";

/**
 * Receipt Data Generation Service (Developer 2 - Stage 2.2)
 *
 * Prepares structured, printable, and downloadable receipt payloads
 * from invoice, order, payment, store, and store_settings records.
 */

/**
 * Builds a complete receipt payload for a given invoice (or order).
 */
export async function buildReceiptForInvoice(admin, {
    invoiceOrOrderParam,
    storeId = null,
}) {
    const param = String(invoiceOrOrderParam || "").trim();
    if (!param) {
        return { error: "Invoice ID or Order ID is required.", status: 400 };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);

    // 1. Try lookup by invoice id or invoice_number first
    let lookupResult = await fetchInvoiceWithDetails(
        admin,
        isUuid ? "id" : "invoice_number",
        param,
        storeId
    );

    // 2. If not found, also allow lookup by order_id or order_number
    if (!lookupResult.invoice) {
        if (isUuid) {
            lookupResult = await fetchInvoiceWithDetails(admin, "order_id", param, storeId);
        } else {
            let ordQuery = admin.from("orders").select("id").eq("order_number", param);
            if (storeId) ordQuery = ordQuery.eq("store_id", storeId);
            const { data: ordMatch } = await ordQuery.maybeSingle();
            if (ordMatch) {
                lookupResult = await fetchInvoiceWithDetails(admin, "order_id", ordMatch.id, storeId);
            }
        }
    }

    if (!lookupResult.invoice || !lookupResult.rawInvoice) {
        return { error: "Receipt not found for the specified invoice or order.", status: 404 };
    }

    const invoice = lookupResult.invoice;
    const rawInvoice = lookupResult.rawInvoice;
    const targetStoreId = invoice.storeId || rawInvoice.store_id;

    // 3. Load store details, store receipt settings, and cashier details
    const [{ data: storeRow }, { data: storeSettings }, { data: cashierRow }] = await Promise.all([
        admin
            .from("stores")
            .select("id, name, code, phone, email, address, city, country, timezone")
            .eq("id", targetStoreId)
            .maybeSingle(),
        admin
            .from("store_settings")
            .select(`
                store_id, currency, currency_code, default_receipt_printer,
                receipt_footer, show_store_address, show_cashier_name,
                show_tax_breakdown, prices_include_tax, default_tax_rate
            `)
            .eq("store_id", targetStoreId)
            .maybeSingle(),
        rawInvoice.order?.cashier_user_id
            ? admin
                  .from("users")
                  .select("id, full_name, username, employee_code")
                  .eq("id", rawInvoice.order.cashier_user_id)
                  .maybeSingle()
            : Promise.resolve({ data: null }),
    ]);

    const showStoreAddress = storeSettings?.show_store_address !== false;
    const showCashierName = storeSettings?.show_cashier_name !== false;
    const showTaxBreakdown = storeSettings?.show_tax_breakdown !== false;
    const receiptFooter = storeSettings?.receipt_footer || "Thank you for shopping with us.";
    const defaultPrinter = storeSettings?.default_receipt_printer || "Main Receipt Printer";
    const currency =
        invoice.currency ||
        storeSettings?.currency_code ||
        storeSettings?.currency ||
        "USD";

    const fullStoreAddress = [storeRow?.address, storeRow?.city, storeRow?.country]
        .filter(Boolean)
        .join(", ");

    // Build tax breakdown grouped by taxRate
    const taxGroupsMap = new Map();
    for (const item of invoice.items || []) {
        const rate = Number(item.taxRate ?? 0);
        const key = String(rate);
        const group = taxGroupsMap.get(key) || {
            taxRate: rate,
            taxableAmount: 0,
            taxAmount: 0,
        };
        const netBeforeTax = roundCurrency((item.lineTotal || 0) - (item.taxAmount || 0));
        group.taxableAmount = roundCurrency(group.taxableAmount + netBeforeTax);
        group.taxAmount = roundCurrency(group.taxAmount + (item.taxAmount || 0));
        taxGroupsMap.set(key, group);
    }

    // Aggregate payment tendered & change totals from completed payments
    const completedPayments = (invoice.payments || []).filter(
        (p) => String(p.paymentStatus || "").toLowerCase() === "completed"
    );
    const totalTendered = roundCurrency(
        completedPayments.reduce((sum, p) => sum + Number(p.tenderedAmount || p.amount || 0), 0)
    );
    const totalChange = roundCurrency(
        completedPayments.reduce((sum, p) => sum + Number(p.changeAmount || 0), 0)
    );

    const cashierName = cashierRow?.full_name || cashierRow?.username || "Cashier";

    const receipt = {
        receiptNumber: `RCP-${invoice.invoiceNumber.replace(/^INV-?/i, "")}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderId: invoice.orderId,
        orderUuid: invoice.orderUuid,
        orderNumber: invoice.orderNumber || invoice.orderId,
        issuedAt: invoice.invoiceDate,
        printedAt: new Date().toISOString(),
        status: invoice.status,
        paymentStatus: invoice.paymentStatus,
        paymentMethod: invoice.paymentMethod,
        currency,

        store: {
            id: targetStoreId,
            name: storeRow?.name || invoice.storeName || "POS Store",
            code: storeRow?.code || invoice.storeCode || "",
            phone: storeRow?.phone || "",
            email: storeRow?.email || "",
            address: showStoreAddress ? fullStoreAddress : "",
            timezone: storeRow?.timezone || "Asia/Colombo",
        },

        cashier: showCashierName
            ? {
                  id: cashierRow?.id || rawInvoice.order?.cashier_user_id || null,
                  name: cashierName,
                  employeeCode: cashierRow?.employee_code || "",
              }
            : null,

        customer: {
            id: invoice.customerId,
            name: invoice.customerName,
            code: invoice.customerCode,
            type: invoice.customerType,
            phone: invoice.customerPhone,
            email: invoice.customerEmail,
            address: invoice.customerAddress,
        },

        items: (invoice.items || []).map((it, idx) => ({
            lineNumber: idx + 1,
            productId: it.productId,
            name: it.name,
            productName: it.productName,
            sku: it.sku,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discountAmount: it.discountAmount,
            taxRate: it.taxRate,
            taxAmount: it.taxAmount,
            lineTotal: it.lineTotal,
        })),

        totals: {
            itemCount: invoice.itemCount,
            subtotal: invoice.subtotal,
            discount: invoice.discountAmount,
            discountAmount: invoice.discountAmount,
            tax: invoice.taxAmount,
            taxAmount: invoice.taxAmount,
            total: invoice.totalAmount,
            totalAmount: invoice.totalAmount,
            paidAmount: invoice.paidAmount,
            tenderedAmount: totalTendered > 0 ? totalTendered : invoice.paidAmount,
            changeAmount: totalChange,
            balanceDue: invoice.balanceDue,
            pricesIncludeTax: Boolean(storeSettings?.prices_include_tax),
        },

        taxBreakdown: showTaxBreakdown ? Array.from(taxGroupsMap.values()) : [],
        payments: invoice.payments || [],

        printConfig: {
            printerName: defaultPrinter,
            footerText: receiptFooter,
            showStoreAddress,
            showCashierName,
            showTaxBreakdown,
        },
    };

    return { receipt, invoice, status: 200 };
}


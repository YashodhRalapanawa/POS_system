import { roundCurrency } from "../tax/taxCalculator.js";
import {
    fetchInvoiceWithDetails,
    generateInvoiceFromOrder,
    summarizePayments,
} from "../invoices/invoiceService.js";

/**
 * Payment Processing & Sale Completion Service (Developer 2 - Stage 2.1)
 */

export const ALLOWED_PAYMENT_METHODS = ["Cash", "Card", "Bank Transfer", "Other"];

/**
 * Normalizes a payment method input (e.g. "CASH" -> "Cash", "BANK_TRANSFER" -> "Bank Transfer").
 */
export function normalizePaymentMethod(rawMethod) {
    if (!rawMethod) return null;
    const cleaned = String(rawMethod).trim().toLowerCase().replace(/[_-]/g, " ");
    if (cleaned === "cash") return "Cash";
    if (cleaned === "card" || cleaned === "credit card" || cleaned === "debit card") return "Card";
    if (cleaned === "bank transfer" || cleaned === "bank" || cleaned === "transfer" || cleaned === "qr") {
        return "Bank Transfer";
    }
    if (cleaned === "other") return "Other";
    return null;
}

/**
 * Normalizes payment status input to match database check constraint
 * ('Pending', 'Completed', 'Failed', 'Refunded') while exposing 'PAID' / 'Completed' consistently.
 */
export function normalizePaymentStatus(rawStatus) {
    if (!rawStatus) return "Completed";
    const cleaned = String(rawStatus).trim().toUpperCase();
    if (cleaned === "PAID" || cleaned === "COMPLETED" || cleaned === "SUCCESS") return "Completed";
    if (cleaned === "PENDING") return "Pending";
    if (cleaned === "FAILED" || cleaned === "DECLINED" || cleaned === "ERROR") return "Failed";
    if (cleaned === "REFUNDED") return "Refunded";
    return null;
}

/**
 * Normalizes a payment row into consistent API response format.
 */
export function formatPaymentResponse(payment, extra = {}) {
    if (!payment) return null;

    const dbStatus = payment.payment_status || payment.paymentStatus || "Completed";
    const statusUpper =
        dbStatus === "Completed"
            ? "PAID"
            : String(dbStatus).toUpperCase();

    return {
        id: payment.id,
        storeId: payment.store_id,
        orderId: payment.order_id,
        orderNumber: extra.orderNumber || payment.order?.order_number || "",
        invoiceId: payment.invoice_id || extra.invoiceId || null,
        invoiceNumber: extra.invoiceNumber || payment.invoice?.invoice_number || "",
        paymentMethod: payment.payment_method,
        method: String(payment.payment_method || "Cash").toUpperCase(),
        paymentStatus: dbStatus,
        status: statusUpper,
        amount: roundCurrency(payment.amount),
        tenderedAmount: roundCurrency(payment.tendered_amount ?? payment.amount),
        changeAmount: roundCurrency(payment.change_amount ?? 0),
        reference: payment.reference || "",
        notes: payment.notes || "",
        processedBy: payment.processed_by,
        processedByName:
            extra.processedByName ||
            payment.processor?.full_name ||
            payment.processor?.username ||
            "",
        processedAt: payment.processed_at || payment.created_at,
        createdAt: payment.created_at,
    };
}

/**
 * Validates payment amount, tendered amount, and method against the remaining invoice balance.
 */
export function validatePaymentInput({
    method,
    amount,
    tenderedAmount,
    balanceDue,
    status = "Completed",
    allowPartial = false,
}) {
    const normalizedMethod = normalizePaymentMethod(method);
    if (!normalizedMethod) {
        return {
            valid: false,
            error: `Unsupported payment method "${method}". Allowed methods: Cash, Card, Bank Transfer, Other.`,
        };
    }

    const normalizedStatus = normalizePaymentStatus(status);
    if (!normalizedStatus) {
        return {
            valid: false,
            error: `Invalid payment status "${status}". Allowed values: PENDING, PAID (Completed), FAILED.`,
        };
    }

    const expectedBalance = roundCurrency(balanceDue);
    const payAmount = amount !== undefined && amount !== null ? roundCurrency(amount) : expectedBalance;

    if (!Number.isFinite(payAmount) || payAmount <= 0) {
        return {
            valid: false,
            error: "Payment amount must be greater than zero.",
        };
    }

    // Cannot overpay the invoice balance (cashiers enter higher tenderedAmount for Cash, not higher amount)
    if (expectedBalance > 0 && payAmount > expectedBalance + 0.01) {
        return {
            valid: false,
            error: `Payment amount (${payAmount.toFixed(2)}) exceeds the remaining invoice balance (${expectedBalance.toFixed(2)}). For cash change, pass the cash received in "tenderedAmount".`,
        };
    }

    if (!allowPartial && expectedBalance > 0 && payAmount < expectedBalance - 0.01 && normalizedStatus === "Completed") {
        return {
            valid: false,
            error: `Under-payment is not allowed: invoice balance is ${expectedBalance.toFixed(2)}, but payment amount is ${payAmount.toFixed(2)}.`,
        };
    }

    const effectiveAmount =
        Math.abs(payAmount - expectedBalance) <= 0.01 && expectedBalance > 0
            ? expectedBalance
            : payAmount;

    const rawTendered =
        tenderedAmount !== undefined && tenderedAmount !== null && tenderedAmount !== ""
            ? roundCurrency(tenderedAmount)
            : effectiveAmount;

    if (rawTendered < effectiveAmount - 0.01 && normalizedStatus === "Completed") {
        return {
            valid: false,
            error: `Tendered amount (${rawTendered.toFixed(2)}) cannot be less than the payment amount (${effectiveAmount.toFixed(2)}).`,
        };
    }

    if (normalizedMethod !== "Cash" && Math.abs(rawTendered - effectiveAmount) > 0.01) {
        return {
            valid: false,
            error: `Only Cash payments can have a tendered amount greater than the payment amount (${normalizedMethod} must match exact payment amount).`,
        };
    }

    const changeAmount =
        normalizedMethod === "Cash" && normalizedStatus === "Completed"
            ? Math.max(0, roundCurrency(rawTendered - effectiveAmount))
            : 0;

    return {
        valid: true,
        paymentMethod: normalizedMethod,
        paymentStatus: normalizedStatus,
        amount: effectiveAmount,
        tenderedAmount: normalizedMethod === "Cash" ? Math.max(rawTendered, effectiveAmount) : effectiveAmount,
        changeAmount,
    };
}

/**
 * Coordinates the final sale completion with Developer 1's order/inventory service
 * so that inventory is deducted (`Sale` stock_movements) exactly once when the invoice is paid.
 */
export async function finalizeOrderAndDeductStockOnce(admin, { orderId, storeId, userId }) {
    const { data: order, error: ordErr } = await admin
        .from("orders")
        .select("id, order_number, store_id, status, completed_at")
        .eq("id", orderId)
        .maybeSingle();

    if (ordErr || !order) {
        return { completed: false, error: "Order not found for sale completion." };
    }

    const currentStatus = String(order.status || "").toLowerCase();

    // Check if Sale stock_movements already exist for this order (guarantees single deduction)
    const { count: existingMovementsCount } = await admin
        .from("stock_movements")
        .select("id", { count: "exact", head: true })
        .eq("store_id", order.store_id)
        .eq("reference_id", order.id)
        .eq("adjustment_type", "Sale");

    if (currentStatus === "completed" && (existingMovementsCount || 0) > 0) {
        return {
            completed: true,
            alreadyCompleted: true,
            stockDeducted: false,
            orderStatus: "Completed",
        };
    }

    // If order was in 'draft', 'pending', or 'held' status and stock was not yet deducted
    if ((existingMovementsCount || 0) === 0 && ["draft", "pending", "held"].includes(currentStatus)) {
        const { data: orderItems } = await admin
            .from("order_items")
            .select("product_id, quantity")
            .eq("order_id", order.id)
            .eq("store_id", order.store_id);

        if (Array.isArray(orderItems) && orderItems.length > 0) {
            const movements = orderItems.map((oi) => ({
                store_id: order.store_id,
                product_id: oi.product_id,
                adjustment_type: "Sale",
                quantity: oi.quantity,
                reference_type: "order",
                reference_id: order.id,
                notes: `POS Order #${order.order_number}`,
                created_by: userId,
            }));

            const { error: moveErr } = await admin.from("stock_movements").insert(movements);
            if (moveErr) {
                return {
                    completed: false,
                    error: moveErr.message || "Insufficient stock to complete sale.",
                };
            }
        }
    }

    await admin
        .from("orders")
        .update({
            status: "Completed",
            completed_at: order.completed_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);

    return {
        completed: true,
        alreadyCompleted: false,
        stockDeducted: (existingMovementsCount || 0) === 0,
        orderStatus: "Completed",
    };
}

/**
 * Processes a payment against an invoice (or order, auto-generating the invoice if needed).
 * Ensures:
 *  - Failed or Pending payments do NOT mark the invoice as Paid or deduct stock
 *  - Valid Completed payments mark the invoice Paid (when balance is met) and trigger stock deduction once
 */
export async function processInvoicePayment(admin, {
    invoiceId,
    orderId,
    storeId,
    userId,
    method,
    amount,
    tenderedAmount,
    status = "Completed",
    reference = "",
    notes = "",
    allowPartial = false,
}) {
    let targetInvoice = null;
    let rawInvoice = null;

    // 1. Resolve target invoice by invoiceId or orderId
    if (invoiceId) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId);
        const col = isUuid ? "id" : "invoice_number";
        const res = await fetchInvoiceWithDetails(admin, col, invoiceId, storeId);
        targetInvoice = res.invoice;
        rawInvoice = res.rawInvoice;
    } else if (orderId) {
        let resolvedOrderUuid = orderId;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
        if (!isUuid) {
            let q = admin.from("orders").select("id").eq("order_number", orderId);
            if (storeId) q = q.eq("store_id", storeId);
            const { data: ordMatch } = await q.maybeSingle();
            if (ordMatch) resolvedOrderUuid = ordMatch.id;
        }

        const existingInv = await fetchInvoiceWithDetails(admin, "order_id", resolvedOrderUuid, storeId);
        if (existingInv.invoice) {
            targetInvoice = existingInv.invoice;
            rawInvoice = existingInv.rawInvoice;
        } else {
            // Auto-generate invoice from order if not yet generated
            const genRes = await generateInvoiceFromOrder(admin, {
                orderId: resolvedOrderUuid,
                storeId,
                userId,
                allowExisting: true,
            });
            if (genRes.error) {
                return { error: genRes.error, status: genRes.status || 400 };
            }
            const loaded = await fetchInvoiceWithDetails(admin, "id", genRes.invoice.id, storeId);
            targetInvoice = loaded.invoice;
            rawInvoice = loaded.rawInvoice;
        }
    }

    if (!targetInvoice || !rawInvoice) {
        return { error: "Invoice not found.", status: 404 };
    }

    if (targetInvoice.status === "Cancelled" || targetInvoice.status === "Refunded") {
        return {
            error: `Cannot record payment for a ${targetInvoice.status.toLowerCase()} invoice (${targetInvoice.invoiceNumber}).`,
            status: 400,
        };
    }

    const existingPayments = rawInvoice.order?.payments || [];
    const currentSummary = summarizePayments(
        existingPayments,
        targetInvoice.totalAmount,
        targetInvoice.status
    );

    if (currentSummary.balanceDue <= 0 && targetInvoice.status === "Paid") {
        return {
            error: `Invoice ${targetInvoice.invoiceNumber} is already fully paid.`,
            status: 409,
            invoice: targetInvoice,
        };
    }

    // 2. Validate payment details against remaining invoice balance
    const validation = validatePaymentInput({
        method,
        amount,
        tenderedAmount,
        balanceDue: currentSummary.balanceDue,
        status,
        allowPartial,
    });

    if (!validation.valid) {
        return { error: validation.error, status: 400 };
    }

    // 3. If payment is Completed and will settle the invoice, ensure stock is available & deducted FIRST
    // so an out-of-stock order cannot be marked Paid without inventory deduction.
    const newTotalPaid =
        validation.paymentStatus === "Completed"
            ? roundCurrency(currentSummary.paidAmount + validation.amount)
            : currentSummary.paidAmount;

    const isFullyPaidNow =
        validation.paymentStatus === "Completed" &&
        newTotalPaid >= roundCurrency(targetInvoice.totalAmount) - 0.01;

    let stockCompletionResult = null;
    if (isFullyPaidNow) {
        stockCompletionResult = await finalizeOrderAndDeductStockOnce(admin, {
            orderId: rawInvoice.order_id,
            storeId: rawInvoice.store_id,
            userId,
        });

        if (!stockCompletionResult.completed) {
            return {
                error: stockCompletionResult.error || "Cannot complete payment due to stock validation failure.",
                status: 400,
            };
        }
    }

    // 4. Insert payment record
    const nowIso = new Date().toISOString();
    const basePaymentPayload = {
        store_id: rawInvoice.store_id,
        order_id: rawInvoice.order_id,
        payment_method: validation.paymentMethod,
        payment_status: validation.paymentStatus,
        amount: validation.amount,
        tendered_amount: validation.tenderedAmount,
        change_amount: validation.changeAmount,
        reference: String(reference || "").trim(),
        processed_by: userId,
        processed_at: nowIso,
    };

    const { data: insertedPayment, error: payFallbackErr } = await admin
        .from("payments")
        .insert(basePaymentPayload)
        .select("*")
        .single();

    if (payFallbackErr || !insertedPayment) {
        return {
            error: `Failed to record payment: ${payFallbackErr?.message || "Unknown error"}`,
            status: 500,
        };
    }

    // 5. Update invoice status ONLY if payment succeeded (Failed/Pending payments never mark invoice Paid)
    if (isFullyPaidNow) {
        await admin
            .from("invoices")
            .update({
                status: "Paid",
                updated_at: nowIso,
            })
            .eq("id", rawInvoice.id);
    }

    const refreshed = await fetchInvoiceWithDetails(admin, "id", rawInvoice.id, rawInvoice.store_id);

    return {
        payment: formatPaymentResponse(insertedPayment, {
            orderNumber: targetInvoice.orderNumber,
            invoiceId: rawInvoice.id,
            invoiceNumber: targetInvoice.invoiceNumber,
        }),
        invoice: refreshed.invoice || targetInvoice,
        saleCompleted: Boolean(isFullyPaidNow),
        stockDeducted: Boolean(stockCompletionResult?.stockDeducted),
        status: 201,
    };
}


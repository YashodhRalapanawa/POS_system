/**
 * Central Tax & Financial Calculation Service (Developer 2 - Stage 1)
 *
 * Provides authoritative backend calculation logic reused across:
 *  - Invoice generation & validation
 *  - POS Order tax/discount calculations
 *  - Return & Credit Note financial calculations
 */

/**
 * Safely rounds a numeric value to 2 decimal places using standard half-up rounding.
 */
export function roundCurrency(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Validates and clamps a tax rate percentage between 0 and 100.
 */
export function normalizeTaxRate(rate, fallbackRate = 0) {
    const parsed = Number(rate);
    if (!Number.isFinite(parsed)) {
        const fb = Number(fallbackRate);
        return Number.isFinite(fb) ? Math.min(100, Math.max(0, roundCurrency(fb))) : 0;
    }
    return Math.min(100, Math.max(0, roundCurrency(parsed)));
}

/**
 * Calculates tax and line total for a single taxable net amount.
 *
 * @param {object} params
 * @param {number} params.netAmount - Line amount after any line/order discounts
 * @param {number} params.taxRate - Percentage tax rate (0 to 100, e.g. 15 for 15%)
 * @param {boolean} [params.pricesIncludeTax=false] - Whether unit prices already include tax
 * @returns {{ netBeforeTax: number, taxRate: number, taxAmount: number, lineTotal: number }}
 */
export function calculateTaxForAmount({ netAmount, taxRate, pricesIncludeTax = false }) {
    const safeNet = Math.max(0, roundCurrency(netAmount));
    const safeRate = normalizeTaxRate(taxRate, 0);

    if (safeRate === 0 || safeNet === 0) {
        return {
            netBeforeTax: safeNet,
            taxRate: safeRate,
            taxAmount: 0,
            lineTotal: safeNet,
        };
    }

    if (pricesIncludeTax) {
        // Inclusive tax: netAmount already includes tax
        // tax = net - (net / (1 + rate/100))
        const netBeforeTax = roundCurrency(safeNet / (1 + safeRate / 100));
        const taxAmount = roundCurrency(safeNet - netBeforeTax);
        return {
            netBeforeTax,
            taxRate: safeRate,
            taxAmount,
            lineTotal: safeNet,
        };
    }

    // Exclusive tax: tax is added on top of netAmount
    const taxAmount = roundCurrency((safeNet * safeRate) / 100);
    const lineTotal = roundCurrency(safeNet + taxAmount);

    return {
        netBeforeTax: safeNet,
        taxRate: safeRate,
        taxAmount,
        lineTotal,
    };
}

/**
 * Calculates full order/invoice financial breakdown across all line items.
 * Matches the exact PostgreSQL logic in `complete_sale`:
 *  1. Computes gross line amounts (quantity * unitPrice)
 *  2. Applies line-level discounts (if any)
 *  3. Allocates order-level discount (percent or fixed) proportionally across items
 *  4. Computes per-line tax (inclusive or exclusive) using product tax rate or store default tax rate
 *  5. Aggregates subtotal, discountAmount, taxAmount, and totalAmount
 *
 * @param {object} params
 * @param {Array} params.items - Array of items: { productId, productName, sku, quantity, unitPrice, unitCost, discountAmount, taxRate }
 * @param {string|null} [params.discountType=null] - 'percent' | 'fixed' | null
 * @param {number} [params.discountValue=0] - Order-level discount value
 * @param {number} [params.defaultTaxRate=0] - Fallback store default tax rate (0-100)
 * @param {boolean} [params.pricesIncludeTax=false] - Whether prices include tax
 * @returns {object} Calculated lines and summary totals
 */
export function calculateDocumentFinancials({
    items = [],
    discountType = null,
    discountValue = 0,
    defaultTaxRate = 0,
    pricesIncludeTax = false,
}) {
    if (!Array.isArray(items) || items.length === 0) {
        return {
            subtotal: 0,
            lineDiscountTotal: 0,
            orderDiscountAmount: 0,
            discountAmount: 0,
            taxableAmount: 0,
            taxAmount: 0,
            totalAmount: 0,
            pricesIncludeTax: Boolean(pricesIncludeTax),
            items: [],
            taxBreakdown: [],
        };
    }

    let subtotal = 0;
    let lineDiscountTotal = 0;

    // Step 1: Prepare gross lines and line-level discounts
    const preLines = items.map((item) => {
        const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
        const unitPrice = Math.max(0, roundCurrency(item.unitPrice ?? item.unit_price ?? item.selling_price ?? 0));
        const unitCost = Math.max(0, roundCurrency(item.unitCost ?? item.unit_cost ?? item.purchase_price ?? 0));
        const gross = roundCurrency(quantity * unitPrice);

        const rawLineDiscount = Math.max(0, roundCurrency(item.discountAmount ?? item.discount_amount ?? 0));
        const lineDiscount = Math.min(rawLineDiscount, gross);

        // Use item's explicit tax_rate if provided (> 0 or explicitly 0), else fallback to defaultTaxRate
        const hasExplicitRate =
            item.taxRate !== undefined && item.taxRate !== null && item.taxRate !== ""
                ? Number(item.taxRate)
                : item.tax_rate !== undefined && item.tax_rate !== null && item.tax_rate !== ""
                  ? Number(item.tax_rate)
                  : null;

        const resolvedRate =
            hasExplicitRate !== null && Number.isFinite(hasExplicitRate) && hasExplicitRate > 0
                ? normalizeTaxRate(hasExplicitRate, defaultTaxRate)
                : normalizeTaxRate(
                      hasExplicitRate === 0 && defaultTaxRate > 0 ? defaultTaxRate : (hasExplicitRate ?? defaultTaxRate),
                      defaultTaxRate
                  );

        subtotal = roundCurrency(subtotal + gross);
        lineDiscountTotal = roundCurrency(lineDiscountTotal + lineDiscount);

        return {
            ...item,
            productId: item.productId || item.product_id || null,
            productName: item.productName || item.product_name || item.name || "",
            sku: item.sku || "",
            quantity,
            unitPrice,
            unitCost,
            gross,
            lineDiscount,
            netAfterLineDiscount: roundCurrency(gross - lineDiscount),
            taxRate: resolvedRate,
        };
    });

    const netTotalAfterLineDiscounts = roundCurrency(subtotal - lineDiscountTotal);

    // Step 2: Calculate order-level discount
    const normalizedDiscountType = discountType ? String(discountType).toLowerCase().trim() : null;
    const rawDiscountVal = Math.max(0, Number(discountValue) || 0);

    let orderDiscountAmount = 0;
    if (normalizedDiscountType === "percent") {
        const clampedPercent = Math.min(100, rawDiscountVal);
        orderDiscountAmount = roundCurrency((netTotalAfterLineDiscounts * clampedPercent) / 100);
    } else if (normalizedDiscountType === "fixed") {
        orderDiscountAmount = Math.min(roundCurrency(rawDiscountVal), netTotalAfterLineDiscounts);
    }

    // Step 3: Allocate order discount across lines and compute tax per line
    let allocatedOrderDiscount = 0;
    let taxTotal = 0;
    const taxGroups = new Map();

    const calculatedItems = preLines.map((line, index) => {
        const isLast = index === preLines.length - 1;
        let orderDiscountShare = 0;

        if (orderDiscountAmount > 0 && netTotalAfterLineDiscounts > 0) {
            if (isLast) {
                orderDiscountShare = roundCurrency(orderDiscountAmount - allocatedOrderDiscount);
            } else {
                orderDiscountShare = roundCurrency(
                    (orderDiscountAmount * line.netAfterLineDiscount) / netTotalAfterLineDiscounts
                );
            }
        }

        allocatedOrderDiscount = roundCurrency(allocatedOrderDiscount + orderDiscountShare);
        const totalLineDiscount = roundCurrency(line.lineDiscount + orderDiscountShare);
        const netLineAmount = Math.max(0, roundCurrency(line.gross - totalLineDiscount));

        const taxCalc = calculateTaxForAmount({
            netAmount: netLineAmount,
            taxRate: line.taxRate,
            pricesIncludeTax,
        });

        taxTotal = roundCurrency(taxTotal + taxCalc.taxAmount);

        // Group tax breakdown by rate
        const rateKey = String(taxCalc.taxRate);
        const existingGroup = taxGroups.get(rateKey) || {
            taxRate: taxCalc.taxRate,
            taxableAmount: 0,
            taxAmount: 0,
        };
        existingGroup.taxableAmount = roundCurrency(existingGroup.taxableAmount + taxCalc.netBeforeTax);
        existingGroup.taxAmount = roundCurrency(existingGroup.taxAmount + taxCalc.taxAmount);
        taxGroups.set(rateKey, existingGroup);

        return {
            id: line.id || undefined,
            orderItemId: line.orderItemId || line.order_item_id || line.id || undefined,
            productId: line.productId,
            productName: line.productName,
            sku: line.sku,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            unitCost: line.unitCost,
            grossAmount: line.gross,
            discountAmount: totalLineDiscount,
            taxRate: taxCalc.taxRate,
            taxableAmount: taxCalc.netBeforeTax,
            taxAmount: taxCalc.taxAmount,
            lineTotal: taxCalc.lineTotal,
        };
    });

    const totalDiscountAmount = roundCurrency(lineDiscountTotal + orderDiscountAmount);
    const netAfterAllDiscounts = roundCurrency(subtotal - totalDiscountAmount);
    const totalAmount = pricesIncludeTax
        ? netAfterAllDiscounts
        : roundCurrency(netAfterAllDiscounts + taxTotal);

    const taxableAmount = pricesIncludeTax
        ? roundCurrency(netAfterAllDiscounts - taxTotal)
        : netAfterAllDiscounts;

    return {
        subtotal,
        lineDiscountTotal,
        orderDiscountAmount,
        discountAmount: totalDiscountAmount,
        taxableAmount,
        taxAmount: taxTotal,
        totalAmount,
        pricesIncludeTax: Boolean(pricesIncludeTax),
        items: calculatedItems,
        taxBreakdown: Array.from(taxGroups.values()),
    };
}

/**
 * Calculates return/credit-note line refund and tax share from an original order/invoice item.
 * Ensures return calculations use the exact same rounding and proportional tax logic.
 *
 * @param {object} params
 * @param {object} params.originalItem - { quantity, unitPrice, discountAmount, taxRate, taxAmount, lineTotal }
 * @param {number} params.returnQuantity - Quantity being returned
 * @param {boolean} [params.pricesIncludeTax=false]
 */
export function calculateReturnItemFinancials({ originalItem, returnQuantity, pricesIncludeTax = false }) {
    const origQty = Math.max(1, parseInt(originalItem.quantity, 10) || 1);
    const retQty = Math.max(1, Math.min(origQty, parseInt(returnQuantity, 10) || 1));

    const unitPrice = roundCurrency(originalItem.unitPrice ?? originalItem.unit_price ?? 0);
    const origTaxRate = normalizeTaxRate(originalItem.taxRate ?? originalItem.tax_rate ?? 0);
    const origTaxAmount = roundCurrency(originalItem.taxAmount ?? originalItem.tax_amount ?? 0);
    const origLineTotal = roundCurrency(originalItem.lineTotal ?? originalItem.line_total ?? origQty * unitPrice);

    // If original item had recorded tax_amount > 0, pro-rate accurately; otherwise calculate from tax_rate
    if (origTaxAmount > 0) {
        const netBeforeTaxTotal = roundCurrency(origLineTotal - origTaxAmount);
        const refundSubtotal = roundCurrency((netBeforeTaxTotal / origQty) * retQty);
        const refundTaxAmount = roundCurrency((origTaxAmount / origQty) * retQty);
        const refundTotal = roundCurrency(refundSubtotal + refundTaxAmount);

        return {
            quantity: retQty,
            unitPrice,
            taxRate: origTaxRate,
            refundSubtotal,
            taxAmount: refundTaxAmount,
            refundTotal,
        };
    }

    // Fallback when order_items were saved in draft mode with tax_amount = 0
    const origDiscount = roundCurrency(originalItem.discountAmount ?? originalItem.discount_amount ?? 0);
    const netUnitAfterDiscount = roundCurrency((origQty * unitPrice - origDiscount) / origQty);
    const netReturnAmount = roundCurrency(netUnitAfterDiscount * retQty);

    const taxCalc = calculateTaxForAmount({
        netAmount: netReturnAmount,
        taxRate: origTaxRate,
        pricesIncludeTax,
    });

    return {
        quantity: retQty,
        unitPrice,
        taxRate: taxCalc.taxRate,
        refundSubtotal: taxCalc.netBeforeTax,
        taxAmount: taxCalc.taxAmount,
        refundTotal: taxCalc.lineTotal,
    };
}

/**
 * Loads the active tax configuration and store tax settings for a given store.
 * Gracefully handles both `public.store_settings` and `public.taxes` (if table exists).
 */
export async function getStoreTaxConfig(admin, storeId) {
    const { data: settings } = await admin
        .from("store_settings")
        .select("store_id, default_tax_rate, prices_include_tax, show_tax_breakdown, currency, currency_code")
        .eq("store_id", storeId)
        .maybeSingle();

    let defaultTaxRate = normalizeTaxRate(settings?.default_tax_rate ?? 15, 15);
    let pricesIncludeTax = Boolean(settings?.prices_include_tax ?? false);
    const showTaxBreakdown = settings?.show_tax_breakdown !== false;

    // Also check if there is an active default tax in public.taxes
    const { data: taxesRows, error: taxesErr } = await admin
        .from("taxes")
        .select("*")
        .eq("store_id", storeId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

    let taxes = [];
    if (!taxesErr && Array.isArray(taxesRows) && taxesRows.length > 0) {
        taxes = taxesRows;
        const activeDefault = taxesRows.find((t) => t.status === "Active" && t.is_default);
        if (activeDefault) {
            defaultTaxRate = normalizeTaxRate(activeDefault.rate, defaultTaxRate);
            pricesIncludeTax = Boolean(activeDefault.is_inclusive);
        }
    } else {
        // Synthesize virtual tax records from store_settings if public.taxes migration is not yet applied
        taxes = [
            {
                id: `default-${storeId}`,
                store_id: storeId,
                code: "TAX-STD",
                name: "Standard Tax",
                description: "Default store tax rate",
                rate: defaultTaxRate,
                is_inclusive: pricesIncludeTax,
                is_default: true,
                effective_from: new Date().toISOString().slice(0, 10),
                effective_to: null,
                status: "Active",
            },
            {
                id: `zero-${storeId}`,
                store_id: storeId,
                code: "TAX-ZERO",
                name: "Zero Rated (0%)",
                description: "Tax-exempt or zero-rated items",
                rate: 0,
                is_inclusive: false,
                is_default: false,
                effective_from: new Date().toISOString().slice(0, 10),
                effective_to: null,
                status: "Active",
            },
        ];
    }

    return {
        storeId,
        defaultTaxRate,
        pricesIncludeTax,
        showTaxBreakdown,
        currency: settings?.currency_code || settings?.currency || "USD",
        taxes,
        hasTaxesTable: !taxesErr,
    };
}


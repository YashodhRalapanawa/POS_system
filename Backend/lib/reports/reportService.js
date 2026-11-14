import { roundCurrency } from "../tax/taxCalculator.js";

/**
 * Report & Dashboard Aggregation Service (Developer 2 - Stage 3.2)
 *
 * Provides real-time financial reporting, performance KPIs, and
 * sales analytics querying authoritative Supabase database records.
 */

/**
 * Generates Daily Sales Report.
 * Includes: total sales, transaction count, payment method totals, discounts,
 * taxes, returns, net sales, top products, and hourly/daily breakdown.
 */
export async function getDailySalesReport(admin, { storeId, targetDate = new Date() }) {
    const d = new Date(targetDate);
    const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
    const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();

    // 1. Fetch completed orders for the day
    let ordersQuery = admin
        .from("orders")
        .select(`
            id, order_number, store_id, status, subtotal, discount_amount, tax_amount, total_amount,
            created_at, completed_at, cashier_user_id, customer_id,
            order_items (id, product_id, product_name, sku, quantity, unit_price, line_total),
            payments (id, payment_method, payment_status, amount)
        `)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .in("status", ["Completed", "Refunded"]);

    if (storeId) {
        ordersQuery = ordersQuery.eq("store_id", storeId);
    }

    const { data: orders = [] } = await ordersQuery;

    // 2. Fetch returns for the day
    let returnsQuery = admin
        .from("returns")
        .select(`
            id, return_number, store_id, status, subtotal, tax_amount, refund_amount, refund_method,
            created_at, return_items (id, product_id, product_name, quantity, refund_amount)
        `)
        .gte("created_at", startOfDay)
        .lte("created_at", endOfDay)
        .neq("status", "Rejected");

    if (storeId) {
        returnsQuery = returnsQuery.eq("store_id", storeId);
    }

    const { data: returns = [] } = await returnsQuery;

    // 3. Aggregate totals
    let totalSales = 0;
    let totalDiscounts = 0;
    let totalTax = 0;
    let totalGross = 0;

    const paymentMethodsMap = new Map([
        ["Cash", { label: "Cash", amount: 0, count: 0 }],
        ["Card", { label: "Card", amount: 0, count: 0 }],
        ["Bank Transfer", { label: "Bank Transfer", amount: 0, count: 0 }],
        ["Other", { label: "Other", amount: 0, count: 0 }],
    ]);

    const productSalesMap = new Map();

    for (const ord of orders) {
        const orderTotal = Number(ord.total_amount || 0);
        totalSales = roundCurrency(totalSales + orderTotal);
        totalDiscounts = roundCurrency(totalDiscounts + Number(ord.discount_amount || 0));
        totalTax = roundCurrency(totalTax + Number(ord.tax_amount || 0));
        totalGross = roundCurrency(totalGross + Number(ord.subtotal || 0));

        // Tally payments
        for (const pay of ord.payments || []) {
            if (String(pay.payment_status).toLowerCase() === "completed") {
                const method = pay.payment_method || "Cash";
                const group = paymentMethodsMap.get(method) || paymentMethodsMap.get("Other");
                group.amount = roundCurrency(group.amount + Number(pay.amount || 0));
                group.count += 1;
            }
        }

        // Tally top products
        for (const item of ord.order_items || []) {
            const key = item.product_id || item.product_name;
            const existing = productSalesMap.get(key) || {
                productId: item.product_id,
                name: item.product_name,
                sku: item.sku || "",
                unitsSold: 0,
                revenue: 0,
            };
            existing.unitsSold += Number(item.quantity || 0);
            existing.revenue = roundCurrency(existing.revenue + Number(item.line_total || 0));
            productSalesMap.set(key, existing);
        }
    }

    // Aggregate returns
    let totalRefundValue = 0;
    let completedReturnsCount = 0;
    let pendingReturnsCount = 0;

    for (const ret of returns) {
        const refAmt = Number(ret.refund_amount || 0);
        totalRefundValue = roundCurrency(totalRefundValue + refAmt);
        if (ret.status === "Completed") completedReturnsCount++;
        else pendingReturnsCount++;
    }

    const netSales = roundCurrency(totalSales - totalRefundValue);
    const transactionCount = orders.length;
    const averageOrderValue = transactionCount > 0 ? roundCurrency(totalSales / transactionCount) : 0;

    const topProducts = Array.from(productSalesMap.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    return {
        date: d.toISOString().slice(0, 10),
        storeId,
        summary: {
            totalSales,
            grossSales: totalGross,
            discounts: totalDiscounts,
            tax: totalTax,
            refundValue: totalRefundValue,
            netSales,
            transactionCount,
            averageOrderValue,
        },
        paymentMethods: Array.from(paymentMethodsMap.values()),
        topProducts,
        returns: {
            totalCount: returns.length,
            completedCount: completedReturnsCount,
            pendingCount: pendingReturnsCount,
            refundValue: totalRefundValue,
        },
    };
}

/**
 * Generates Monthly Sales & Analytics Report.
 * Groups sales by day/week, categories, products, cashiers, and payment methods.
 */
export async function getMonthlySalesReport(admin, { storeId, year, month }) {
    const y = parseInt(year, 10) || new Date().getFullYear();
    const m = parseInt(month, 10) || new Date().getMonth() + 1;

    const startDate = new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString();
    const lastDayOfMonth = new Date(y, m, 0).getDate();
    const endDate = new Date(y, m - 1, lastDayOfMonth, 23, 59, 59, 999).toISOString();

    let ordersQuery = admin
        .from("orders")
        .select(`
            id, order_number, store_id, status, subtotal, discount_amount, tax_amount, total_amount,
            created_at, completed_at, cashier_user_id,
            cashier:users (id, full_name, username),
            order_items (id, product_id, product_name, sku, quantity, unit_price, line_total),
            payments (id, payment_method, payment_status, amount)
        `)
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .in("status", ["Completed", "Refunded"]);

    if (storeId) {
        ordersQuery = ordersQuery.eq("store_id", storeId);
    }

    const { data: orders = [] } = await ordersQuery;

    let returnsQuery = admin
        .from("returns")
        .select(`
            id, return_number, store_id, status, subtotal, tax_amount, refund_amount, refund_method, created_at
        `)
        .gte("created_at", startDate)
        .lte("created_at", endDate)
        .neq("status", "Rejected");

    if (storeId) {
        returnsQuery = returnsQuery.eq("store_id", storeId);
    }

    const { data: returns = [] } = await returnsQuery;

    let totalSales = 0;
    let totalDiscounts = 0;
    let totalTax = 0;

    const cashierMap = new Map();
    const paymentMethodsMap = new Map([
        ["Cash", { label: "Cash", amount: 0, count: 0 }],
        ["Card", { label: "Card", amount: 0, count: 0 }],
        ["Bank Transfer", { label: "Bank Transfer", amount: 0, count: 0 }],
        ["Other", { label: "Other", amount: 0, count: 0 }],
    ]);

    const dailyTrendMap = new Map();
    for (let day = 1; day <= lastDayOfMonth; day++) {
        dailyTrendMap.set(day, { day, value: 0, count: 0 });
    }

    const productSalesMap = new Map();

    for (const ord of orders) {
        const orderTotal = Number(ord.total_amount || 0);
        totalSales = roundCurrency(totalSales + orderTotal);
        totalDiscounts = roundCurrency(totalDiscounts + Number(ord.discount_amount || 0));
        totalTax = roundCurrency(totalTax + Number(ord.tax_amount || 0));

        // Daily trend
        const orderDay = new Date(ord.created_at).getDate();
        if (dailyTrendMap.has(orderDay)) {
            const entry = dailyTrendMap.get(orderDay);
            entry.value = roundCurrency(entry.value + orderTotal);
            entry.count += 1;
        }

        // Cashier breakdown
        const cashierName = ord.cashier?.full_name || ord.cashier?.username || "Cashier";
        const cEntry = cashierMap.get(cashierName) || {
            name: cashierName,
            transactions: 0,
            revenue: 0,
        };
        cEntry.transactions += 1;
        cEntry.revenue = roundCurrency(cEntry.revenue + orderTotal);
        cashierMap.set(cashierName, cEntry);

        // Payments
        for (const pay of ord.payments || []) {
            if (String(pay.payment_status).toLowerCase() === "completed") {
                const method = pay.payment_method || "Cash";
                const pEntry = paymentMethodsMap.get(method) || paymentMethodsMap.get("Other");
                pEntry.amount = roundCurrency(pEntry.amount + Number(pay.amount || 0));
                pEntry.count += 1;
            }
        }

        // Products
        for (const it of ord.order_items || []) {
            const key = it.product_id || it.product_name;
            const existing = productSalesMap.get(key) || {
                name: it.product_name,
                sku: it.sku || "",
                unitsSold: 0,
                revenue: 0,
            };
            existing.unitsSold += Number(it.quantity || 0);
            existing.revenue = roundCurrency(existing.revenue + Number(it.line_total || 0));
            productSalesMap.set(key, existing);
        }
    }

    let totalRefundValue = 0;
    for (const ret of returns) {
        totalRefundValue = roundCurrency(totalRefundValue + Number(ret.refund_amount || 0));
    }

    return {
        year: y,
        month: m,
        storeId,
        summary: {
            totalSales,
            discounts: totalDiscounts,
            tax: totalTax,
            refundValue: totalRefundValue,
            netSales: roundCurrency(totalSales - totalRefundValue),
            transactionCount: orders.length,
            averageOrderValue: orders.length > 0 ? roundCurrency(totalSales / orders.length) : 0,
        },
        dailyTrend: Array.from(dailyTrendMap.values()),
        cashierPerformance: Array.from(cashierMap.values()).sort((a, b) => b.revenue - a.revenue),
        paymentMethods: Array.from(paymentMethodsMap.values()),
        topProducts: Array.from(productSalesMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    };
}

/**
 * Generates Dashboard Summary.
 * Today's sales, average basket value, inventory alerts (low stock), returns,
 * recent transactions, and online registers status.
 */
export async function getDashboardSummary(admin, { storeId }) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

    // 1. Today's orders
    let todayOrdersQuery = admin
        .from("orders")
        .select(`
            id, order_number, status, total_amount, subtotal, created_at,
            customer:customers (name),
            cashier:users (full_name, username),
            payments (payment_method, amount, payment_status)
        `)
        .gte("created_at", startOfToday)
        .lte("created_at", endOfToday)
        .in("status", ["Completed", "Refunded"]);

    if (storeId) todayOrdersQuery = todayOrdersQuery.eq("store_id", storeId);
    const { data: todayOrders = [] } = await todayOrdersQuery;

    // 2. Today's sales & basket value
    let todaySales = 0;
    for (const o of todayOrders) {
        todaySales = roundCurrency(todaySales + Number(o.total_amount || 0));
    }
    const todayTransactions = todayOrders.length;
    const avgBasketValue = todayTransactions > 0 ? roundCurrency(todaySales / todayTransactions) : 0;

    // 3. Low stock inventory alerts
    let invQuery = admin
        .from("inventory")
        .select(`
            current_stock, reserved_stock,
            product:products (id, name, sku, reorder_level, selling_price, status)
        `)
        .not("product", "is", null);

    if (storeId) invQuery = invQuery.eq("store_id", storeId);
    const { data: invRows = [] } = await invQuery;

    const lowStockAlerts = [];
    for (const r of invRows) {
        const prod = r.product;
        if (!prod || prod.status !== "Active") continue;
        const avail = Number(r.current_stock || 0) - Number(r.reserved_stock || 0);
        const reorder = Number(prod.reorder_level || 0);
        if (avail <= Math.max(reorder, 5)) {
            lowStockAlerts.push({
                productId: prod.id,
                name: prod.name,
                sku: prod.sku,
                currentStock: Number(r.current_stock || 0),
                availableQuantity: avail,
                reorderLevel: reorder,
                status: avail <= 0 ? "Out of stock" : "Low stock",
            });
        }
    }

    // 4. Returns summary
    let returnsQuery = admin
        .from("returns")
        .select("id, status, refund_amount")
        .gte("created_at", startOfToday)
        .lte("created_at", endOfToday);

    if (storeId) returnsQuery = returnsQuery.eq("store_id", storeId);
    const { data: todayReturns = [] } = await returnsQuery;

    let todayRefunds = 0;
    for (const ret of todayReturns) {
        if (ret.status !== "Rejected") {
            todayRefunds = roundCurrency(todayRefunds + Number(ret.refund_amount || 0));
        }
    }

    // 5. Recent transactions for journal
    let recentQuery = admin
        .from("orders")
        .select(`
            id, order_number, status, total_amount, created_at,
            customer:customers (name),
            cashier:users (full_name, username),
            payments (payment_method, amount, payment_status)
        `)
        .order("created_at", { ascending: false })
        .limit(6);

    if (storeId) recentQuery = recentQuery.eq("store_id", storeId);
    const { data: recentOrders = [] } = await recentQuery;

    const recentTransactions = recentOrders.map((o) => {
        const p = (o.payments || [])[0];
        return {
            id: `#${o.order_number}`,
            time: new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            cashier: o.cashier?.full_name || o.cashier?.username || "Cashier",
            customer: o.customer?.name || "Walk-in",
            amount: Number(o.total_amount || 0),
            payment: p?.payment_method || "Cash",
            status: o.status,
        };
    });

    // 6. Registers online count
    let regQuery = admin.from("registers").select("id, status", { count: "exact" });
    if (storeId) regQuery = regQuery.eq("store_id", storeId);
    const { data: registers = [] } = await regQuery;
    const activeRegisters = registers.filter((r) => r.status === "Active").length;

    return {
        todaySales,
        todayTransactions,
        averageBasketValue: avgBasketValue,
        netSales: roundCurrency(todaySales - todayRefunds),
        refundsValue: todayRefunds,
        returnsCount: todayReturns.length,
        registers: {
            active: activeRegisters,
            total: registers.length,
        },
        lowStockCount: lowStockAlerts.length,
        lowStockAlerts: lowStockAlerts.slice(0, 10),
        recentTransactions,
    };
}


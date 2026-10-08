import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { hasPermission } from "../auth/authorize.js";

const isoDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .describe("Store-local date in YYYY-MM-DD format");

const dateRange = {
    from: isoDate.describe("First day of the period (YYYY-MM-DD), inclusive"),
    to: isoDate.describe("Last day of the period (YYYY-MM-DD), inclusive"),
};

const limit = (max, fallback) =>
    z.number().int().min(1).max(max).optional().describe(`How many rows to return (default ${fallback}, max ${max})`);

/**
 * Precomputes the period-over-period change so the model never does the arithmetic.
 */
function addSalesComparison(data) {
    const current = Number(data?.totals?.total_sales ?? 0);
    const previous = Number(data?.previous_period?.totals?.total_sales ?? 0);
    const change = Math.round((current - previous) * 100) / 100;
    const percent = previous === 0 ? null : Math.round((change / previous) * 1000) / 10;

    let summary;
    if (previous === 0 && current === 0) summary = "No sales in either period.";
    else if (previous === 0) summary = "No sales in the previous period, so there is no percentage change to report.";
    else summary = `${percent >= 0 ? "Up" : "Down"} ${Math.abs(percent)}% compared with the previous period.`;

    return {
        ...data,
        comparison: { previous_total_sales: previous, change_amount: change, change_percent: percent, summary },
    };
}

/**
 * Every tool the assistant can use. Each one maps to a read-only Postgres function
 * (see supabase/migrations/202610080001_chatbot_tools.sql) that runs with the caller's
 * RLS. `permissions` is any-of: the tool is only offered when the user holds one of them.
 */
const TOOL_DEFINITIONS = {
    get_sales_summary: {
        permissions: ["reports.view"],
        rpc: "chat_sales_summary",
        label: "Sales summary",
        description:
            "Sales totals for a date range: order count, items sold, gross sales, discounts, tax, total sales, " +
            "average order value, refunds, estimated gross profit and payment methods. Also returns " +
            "previous_period: the same-length period immediately before (for a single day, that is the day before).",
        inputSchema: z.object(dateRange),
        toParams: ({ from, to }) => ({ p_from: from, p_to: to }),
        transform: addSalesComparison,
    },
    get_sales_by_day: {
        permissions: ["reports.view"],
        rpc: "chat_sales_by_day",
        label: "Daily sales trend",
        description: "Order count and total sales for each day in a date range. Use for trends and best/worst days.",
        inputSchema: z.object(dateRange),
        toParams: ({ from, to }) => ({ p_from: from, p_to: to }),
    },
    get_top_products: {
        permissions: ["reports.view"],
        rpc: "chat_top_products",
        label: "Best-selling products",
        description:
            "Best-selling products in a date range with quantity sold, revenue and estimated gross profit. " +
            "Sort by 'quantity' (units sold) or 'revenue'.",
        inputSchema: z.object({
            ...dateRange,
            limit: limit(50, 10),
            sortBy: z.enum(["quantity", "revenue"]).optional().describe("Ranking metric (default quantity)"),
        }),
        toParams: ({ from, to, limit: n, sortBy }) => ({
            p_from: from,
            p_to: to,
            p_limit: n ?? 10,
            p_sort_by: sortBy ?? "quantity",
        }),
    },
    get_staff_sales: {
        permissions: ["reports.view"],
        rpc: "chat_staff_sales",
        label: "Sales by staff",
        description: "Sales per cashier/staff member in a date range: orders, total sales and average order value.",
        inputSchema: z.object(dateRange),
        toParams: ({ from, to }) => ({ p_from: from, p_to: to }),
    },
    find_products: {
        permissions: ["products.view", "inventory.view", "pos.use"],
        rpc: "chat_product_lookup",
        label: "Product lookup",
        description:
            "Search products by name, SKU or barcode. Returns price, stock on hand/available, reorder level, " +
            "category, supplier and status.",
        inputSchema: z.object({
            query: z.string().min(2).max(100).describe("Product name, SKU or barcode to search for"),
            limit: limit(25, 10),
        }),
        toParams: ({ query, limit: n }) => ({ p_query: query, p_limit: n ?? 10 }),
    },
    get_low_stock: {
        permissions: ["inventory.view", "products.view"],
        rpc: "chat_low_stock",
        label: "Low stock",
        description:
            "Active products that are out of stock or at/below their reorder level, with supplier names. " +
            "Use for reorder questions.",
        inputSchema: z.object({ limit: limit(100, 20) }),
        toParams: ({ limit: n }) => ({ p_limit: n ?? 20 }),
    },
    get_inventory_summary: {
        permissions: ["inventory.view", "products.view"],
        rpc: "chat_inventory_summary",
        label: "Inventory overview",
        description:
            "Overall inventory: number of products, total units, out-of-stock and low-stock counts, and stock value.",
        inputSchema: z.object({}),
        toParams: () => ({}),
    },
    find_customers: {
        permissions: ["customers.view"],
        rpc: "chat_customer_lookup",
        label: "Customer lookup",
        description:
            "Search customers by name or customer code. Returns purchase history totals " +
            "(orders, total spent, last purchase). Contact details are never available.",
        inputSchema: z.object({
            query: z.string().min(2).max(100).describe("Customer name or code"),
            limit: limit(25, 10),
        }),
        toParams: ({ query, limit: n }) => ({ p_query: query, p_limit: n ?? 10 }),
    },
    get_top_customers: {
        permissions: ["reports.view"],
        rpc: "chat_top_customers",
        label: "Top customers",
        description: "Customers who spent the most in a date range (walk-in sales excluded).",
        inputSchema: z.object({ ...dateRange, limit: limit(50, 10) }),
        toParams: ({ from, to, limit: n }) => ({ p_from: from, p_to: to, p_limit: n ?? 10 }),
    },
    get_returns_summary: {
        permissions: ["returns.view", "returns.process", "reports.view"],
        rpc: "chat_returns_summary",
        label: "Returns summary",
        description: "Returns in a date range: counts and refund amounts by status, reasons, and most returned products.",
        inputSchema: z.object(dateRange),
        toParams: ({ from, to }) => ({ p_from: from, p_to: to }),
    },
    get_shift_summary: {
        permissions: ["reports.view", "pos.use"],
        rpc: "chat_shift_summary",
        label: "Shift summary",
        description:
            "Register shifts opened on a date: who opened/closed them, opening and closing cash, sales, cash sales, " +
            "expected cash and cash difference. Staff without report access only see their own shifts.",
        inputSchema: z.object({
            date: isoDate.optional().describe("Shift date (YYYY-MM-DD). Defaults to today."),
        }),
        toParams: ({ date }) => ({ p_date: date ?? null }),
    },
};

// Postgres error codes raised by the chat_* functions with user-safe messages.
const SAFE_ERROR_CODES = new Set(["42501", "22023", "22007", "22008"]);

function toolErrorMessage(error) {
    if (error?.code && SAFE_ERROR_CODES.has(error.code) && error.message) {
        return error.message;
    }
    return "This information could not be loaded right now.";
}

function canUse(user, definition) {
    return definition.permissions.some((key) => hasPermission(user, key));
}

/**
 * Lists the tools a staff profile may use (for GET /api/chat and the prompt).
 */
export function listAvailableTools(user) {
    return Object.entries(TOOL_DEFINITIONS)
        .filter(([, definition]) => canUse(user, definition))
        .map(([name, definition]) => ({ name, label: definition.label, description: definition.description }));
}

/**
 * Builds the AI SDK tool set for one request. Tools run through the user-scoped
 * Supabase client, so the database enforces store isolation and permissions.
 */
export function buildChatTools(user, client) {
    const tools = {};

    for (const [name, definition] of Object.entries(TOOL_DEFINITIONS)) {
        if (!canUse(user, definition)) continue;

        tools[name] = tool({
            description: definition.description,
            inputSchema: definition.inputSchema,
            execute: async (input) => {
                const { data, error } = await client.rpc(definition.rpc, definition.toParams(input));
                if (error) {
                    console.error(`[chat] tool ${name} failed:`, error.code, error.message);
                    return { error: toolErrorMessage(error) };
                }
                return definition.transform ? definition.transform(data) : data;
            },
        });
    }

    return tools;
}

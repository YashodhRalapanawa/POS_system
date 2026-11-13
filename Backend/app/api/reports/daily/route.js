import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../lib/responses/index.js";
import { getDailySalesReport } from "../../../../lib/reports/reportService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/daily
 * Retrieves daily sales summary, net sales, taxes, discounts, payment methods, and top products.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "reports.view",
            "dashboard.view",
            "orders.view",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const url = new URL(request.url);
        const dateParam = url.searchParams.get("date") || new Date().toISOString();
        const requestedStoreId = (url.searchParams.get("storeId") || "").trim();

        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        let effectiveStoreId = authStoreId;
        if (isAdmin && requestedStoreId && requestedStoreId !== "All" && requestedStoreId !== "All Stores") {
            effectiveStoreId = requestedStoreId;
        }

        const admin = getSupabaseAdmin();
        const report = await getDailySalesReport(admin, {
            storeId: effectiveStoreId,
            targetDate: dateParam,
        });

        return successResponse({ report }, "Daily report generated successfully");
    } catch (err) {
        return errorResponse("An unexpected error occurred while generating daily report.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


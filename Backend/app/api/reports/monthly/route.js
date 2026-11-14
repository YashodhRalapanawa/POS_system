import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../lib/responses/index.js";
import { getMonthlySalesReport } from "../../../../lib/reports/reportService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/monthly
 * Retrieves monthly sales summary, trend, cashier performance, products and payment method breakdown.
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
        const year = url.searchParams.get("year");
        const month = url.searchParams.get("month");
        const requestedStoreId = (url.searchParams.get("storeId") || "").trim();

        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        let effectiveStoreId = authStoreId;
        if (isAdmin && requestedStoreId && requestedStoreId !== "All" && requestedStoreId !== "All Stores") {
            effectiveStoreId = requestedStoreId;
        }

        const admin = getSupabaseAdmin();
        const report = await getMonthlySalesReport(admin, {
            storeId: effectiveStoreId,
            year,
            month,
        });

        return successResponse({ report }, "Monthly report generated successfully");
    } catch (err) {
        return errorResponse("An unexpected error occurred while generating monthly report.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


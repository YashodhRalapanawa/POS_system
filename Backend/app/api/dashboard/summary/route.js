import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../lib/responses/index.js";
import { getDashboardSummary } from "../../../../lib/reports/reportService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/summary
 * Retrieves live KPIs, low stock alerts, today's sales, returns, and recent transactions for dashboard.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "dashboard.view",
            "reports.view",
            "pos.use",
            "orders.view",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const url = new URL(request.url);
        const requestedStoreId = (url.searchParams.get("storeId") || "").trim();

        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        let effectiveStoreId = authStoreId;
        if (isAdmin && requestedStoreId && requestedStoreId !== "All" && requestedStoreId !== "All Stores") {
            effectiveStoreId = requestedStoreId;
        }

        const admin = getSupabaseAdmin();
        const summary = await getDashboardSummary(admin, {
            storeId: effectiveStoreId,
        });

        return successResponse({ summary }, "Dashboard summary retrieved successfully");
    } catch (err) {
        return errorResponse("An unexpected error occurred while loading dashboard summary.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


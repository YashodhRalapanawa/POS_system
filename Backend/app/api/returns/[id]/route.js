import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../lib/responses/index.js";
import {
    fetchReturnWithDetails,
    updateReturnStatus,
} from "../../../../lib/returns/returnService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/returns/[id]
 * Retrieves details of a single return by UUID or return_number.
 */
export async function GET(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "returns.view",
            "returns.create",
            "returns.process",
            "pos.use",
            "orders.view",
            "invoices.view",
            "reports.view",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const { id: rawId } = await params;
        const returnParam = (rawId || "").trim();
        if (!returnParam) {
            return errorResponse("Return ID is required.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const scopedStoreId = isAdmin ? null : authStoreId;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(returnParam);
        const col = isUuid ? "id" : "return_number";

        const { returnRecord, error } = await fetchReturnWithDetails(
            admin,
            col,
            returnParam,
            scopedStoreId
        );

        if (error || !returnRecord) {
            return errorResponse("Return record not found.", 404);
        }

        return successResponse({ return: returnRecord }, "Return retrieved successfully");
    } catch (err) {
        return errorResponse("An unexpected error occurred while retrieving the return.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

/**
 * PATCH /api/returns/[id]
 * Transitions return status (Approved, Rejected, Completed).
 */
export async function PATCH(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "returns.process",
            "orders.manage",
            "pos.use",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const { id: rawId } = await params;
        const returnParam = (rawId || "").trim();
        if (!returnParam) {
            return errorResponse("Return ID is required.", 400);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON request payload.", 400);
        }

        const status = body.status;
        if (!status) {
            return errorResponse("Status is required (Approved, Rejected, or Completed).", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const scopedStoreId = isAdmin ? null : authStoreId;

        const result = await updateReturnStatus(admin, {
            returnId: returnParam,
            storeId: scopedStoreId,
            userId: auth.user.id,
            status,
            rejectionReason: body.rejectionReason || body.rejection_reason || body.reason || "",
            notes: body.notes || "",
        });

        if (result.error) {
            return errorResponse(result.error, result.status || 400);
        }

        return successResponse(
            { return: result.returnRecord },
            `Return ${result.returnRecord.returnNumber} marked as ${result.returnRecord.status}`
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while updating the return.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


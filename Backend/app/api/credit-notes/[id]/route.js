import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../lib/responses/index.js";
import { getCreditNoteById } from "../../../../lib/creditNotes/creditNoteService.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/credit-notes/[id]
 * Retrieves details of a single credit note by ID or credit_note_number.
 */
export async function GET(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "credit_notes.view",
            "credit_notes.create",
            "returns.view",
            "invoices.view",
            "pos.use",
            "reports.view",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const { id: rawId } = await params;
        const cnParam = (rawId || "").trim();
        if (!cnParam) {
            return errorResponse("Credit Note ID is required.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";
        const scopedStoreId = isAdmin ? null : authStoreId;

        const { creditNote, error } = await getCreditNoteById(admin, cnParam, scopedStoreId);
        if (error || !creditNote) {
            return errorResponse("Credit note not found.", 404);
        }

        return successResponse({ creditNote }, "Credit note retrieved successfully");
    } catch (err) {
        return errorResponse("An unexpected error occurred while retrieving the credit note.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/setup-status
 * Checks if the system has been initialized (i.e. whether at least one Admin account exists).
 */
export async function GET() {
    try {
        if (!isSupabaseAdminConfigured()) {
            return Response.json(
                { success: false, message: "Database is not configured yet." },
                { status: 503 }
            );
        }

        const admin = getSupabaseAdmin();

        // Check if any Admin role exists in the public.users table
        const { count, error } = await admin
            .from("users")
            .select("id, role:roles!inner(name)", { count: "exact", head: true })
            .eq("roles.name", "Admin");

        if (error) {
            // Fallback: check total users count in public.users
            const { count: totalCount, error: countErr } = await admin
                .from("users")
                .select("id", { count: "exact", head: true });

            if (countErr) {
                return Response.json(
                    { success: false, message: "Failed to determine system setup status." },
                    { status: 500 }
                );
            }

            return Response.json({
                success: true,
                isSetupComplete: Boolean(totalCount && totalCount > 0),
                adminCount: totalCount || 0,
            });
        }

        const isSetupComplete = Boolean(count && count > 0);

        return Response.json({
            success: true,
            isSetupComplete,
            adminCount: count || 0,
        });
    } catch (err) {
        return Response.json(
            { success: false, message: err.message || "Failed to check setup status." },
            { status: 500 }
        );
    }
}


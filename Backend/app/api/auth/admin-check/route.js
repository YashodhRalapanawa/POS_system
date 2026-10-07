import { requireAuthAndRole, ROLES } from "../../../../lib/auth/authorize";

export const dynamic = "force-dynamic";

/**
 * Test endpoint for verifying role authorization.
 * Requires ADMIN role.
 * GET /api/auth/admin-check
 */
export async function GET(request) {
    const auth = await requireAuthAndRole(request, [ROLES.ADMIN]);
    if (!auth.authorized) {
        return auth.response;
    }

    return Response.json(
        {
            success: true,
            message: "Admin access granted",
        },
        { status: 200 }
    );
}

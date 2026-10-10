import { extractBearerToken, verifyUserToken, createUserClient } from "../../../../lib/supabase/server.js";
import { loadStaffProfile } from "../../../../lib/supabase/profile.js";

export const dynamic = "force-dynamic";

/**
 * Protected endpoint returning the currently authenticated POS staff user.
 * GET /api/auth/me
 */
export async function GET(request) {
    try {
        // Step 1: Read and validate Authorization header
        const token = extractBearerToken(request);
        if (!token) {
            return Response.json(
                {
                    success: false,
                    message: "Authentication required",
                },
                { status: 401 }
            );
        }

        // Step 2: Verify Supabase access token
        const { user: authUser, error: authError } = await verifyUserToken(token);
        if (authError || !authUser) {
            return Response.json(
                {
                    success: false,
                    message: "Invalid or expired authentication token",
                },
                { status: 401 }
            );
        }

        // Step 7: User-scoped client so RLS applies
        const db = createUserClient(token);

        // Step 3: Load matching staff profile
        const profile = await loadStaffProfile(db, authUser.id);

        // Step 6: Profile not found
        if (!profile) {
            return Response.json(
                {
                    success: false,
                    message: "Staff profile not found",
                },
                { status: 404 }
            );
        }

        // Step 4: Active status check
        if (!profile.isActive || profile.status !== "Active") {
            return Response.json(
                {
                    success: false,
                    message: "User account is inactive",
                },
                { status: 403 }
            );
        }

        // Step 5: Frontend-compatible response with no sensitive secrets
        return Response.json(
            {
                success: true,
                message: "Authenticated user retrieved successfully",
                data: {
                    user: profile,
                },
                user: profile,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            {
                success: false,
                message: "Something went wrong while retrieving user profile",
            },
            { status: 500 }
        );
    }
}

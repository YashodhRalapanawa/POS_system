import { createServerClient } from "../../../../lib/supabase/server.js";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/refresh
 * Exchanges a valid Supabase refresh token for a fresh access token and refresh token.
 */
export async function POST(request) {
    try {
        let body;
        try {
            body = await request.json();
        } catch {
            return Response.json(
                { success: false, error: "Invalid JSON request body." },
                { status: 400 }
            );
        }

        const refreshToken = String(body?.refreshToken || body?.refresh_token || "").trim();
        if (!refreshToken) {
            return Response.json(
                { success: false, error: "Refresh token is required." },
                { status: 400 }
            );
        }

        const authClient = createServerClient();
        const { data, error } = await authClient.auth.refreshSession({
            refresh_token: refreshToken,
        });

        if (error || !data?.session?.access_token) {
            return Response.json(
                { success: false, error: error?.message || "Session expired. Please sign in again." },
                { status: 401 }
            );
        }

        return Response.json(
            {
                success: true,
                session: {
                    accessToken: data.session.access_token,
                    refreshToken: data.session.refresh_token,
                    expiresAt: data.session.expires_at,
                },
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, error: "Failed to refresh session." },
            { status: 500 }
        );
    }
}


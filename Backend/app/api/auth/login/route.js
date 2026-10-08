import { createServerClient, createUserClient } from "../../../../lib/supabase/server.js";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { loadStaffProfile } from "../../../../lib/supabase/profile.js";

export const dynamic = "force-dynamic";

const INVALID_CREDENTIALS = "Incorrect email/username or password.";

function toSession(session) {
    return {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at,
    };
}

async function resolveLoginEmail(identifier) {
    if (identifier.includes("@")) {
        return identifier.toLowerCase();
    }
    if (!isSupabaseAdminConfigured()) {
        return null;
    }
    try {
        const admin = getSupabaseAdmin();
        const { data, error } = await admin.rpc("get_login_email", { p_identifier: identifier });
        if (error) return null;
        return data || null;
    } catch {
        return null;
    }
}

async function recordFailedSignIn(email, request) {
    if (!isSupabaseAdminConfigured()) return;
    try {
        const admin = getSupabaseAdmin();
        const { data: user } = await admin
            .from("users")
            .select("id, store_id")
            .eq("email", email)
            .maybeSingle();

        if (!user) return;

        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
        const userAgent = request.headers.get("user-agent") || null;

        await admin.from("activity_logs").insert({
            store_id: user.store_id,
            user_id: user.id,
            entity_type: "user",
            entity_id: user.id,
            action: "Failed sign-in attempt",
            description: "Incorrect password",
            ip_address: ip,
            user_agent: userAgent,
        });
    } catch {
        // Silently catch logging errors to prevent failing authentication flow
    }
}

async function revokeSession(accessToken) {
    if (!isSupabaseAdminConfigured()) return;
    try {
        const admin = getSupabaseAdmin();
        await admin.auth.admin.signOut(accessToken, "local");
    } catch {
        // Silently catch revocation errors
    }
}



/**
 * Login Route Handler
 * POST /api/auth/login
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

        const identifier = String(body?.identifier ?? body?.email ?? body?.username ?? "").trim();
        const password = String(body?.password ?? "");

        // Step 2: Validate required fields
        if (!identifier || !password) {
            return Response.json(
                { success: false, error: "Enter your email or username and your password." },
                { status: 400 }
            );
        }

        if (!identifier.includes("@") && !isSupabaseAdminConfigured()) {
            return Response.json(
                { success: false, error: "Sign in with your email address." },
                { status: 400 }
            );
        }

        // Step 4: Resolve identifier to email
        const email = await resolveLoginEmail(identifier);
        if (!email) {
            return Response.json(
                { success: false, error: INVALID_CREDENTIALS },
                { status: 401 }
            );
        }

        // Step 3: Supabase Auth sign-in
        let authClient;
        try {
            authClient = createServerClient();
        } catch {
            return Response.json(
                { success: false, error: "Authentication service is temporarily unavailable." },
                { status: 503 }
            );
        }

        const { data, error } = await authClient.auth.signInWithPassword({ email, password });
        if (error) {
            if (error.code === "email_not_confirmed") {
                return Response.json(
                    { success: false, error: "Confirm your email address before signing in." },
                    { status: 403 }
                );
            }
            await recordFailedSignIn(email, request);
            return Response.json(
                { success: false, error: INVALID_CREDENTIALS },
                { status: 401 }
            );
        }

        const accessToken = data.session.access_token;
        const db = createUserClient(accessToken);

        // Step 5: Active staff validation & record sign in
        const { error: signInError } = await db.rpc("record_sign_in");
        if (signInError) {
            await revokeSession(accessToken);
            return Response.json(
                { success: false, error: signInError.message || "This account is not permitted to sign in." },
                { status: 403 }
            );
        }

        // Step 6: Load full profile for frontend
        const user = await loadStaffProfile(db, data.user.id);

        return Response.json(
            {
                success: true,
                session: toSession(data.session),
                user,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, error: "Something went wrong. Please try again." },
            { status: 500 }
        );
    }
}

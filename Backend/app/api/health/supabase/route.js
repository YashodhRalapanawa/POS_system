import { getSupabaseEnv } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Health check endpoint for Supabase connectivity.
 * GET /api/health/supabase
 */
export async function GET() {
    try {
        let env;
        try {
            env = getSupabaseEnv();
        } catch {
            return Response.json(
                {
                    status: "error",
                    message: "Supabase environment variables not configured",
                },
                { status: 503 }
            );
        }

        const { supabaseUrl, supabaseAnonKey } = env;

        // Verify connectivity via Supabase Auth service health endpoint
        const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
            headers: { apikey: supabaseAnonKey },
            signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
            return Response.json(
                {
                    status: "error",
                    message: "Supabase connection failed",
                },
                { status: 503 }
            );
        }

        return Response.json(
            {
                status: "ok",
                message: "Supabase connection is working",
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            {
                status: "error",
                message: "Supabase connection failed",
            },
            { status: 503 }
        );
    }
}

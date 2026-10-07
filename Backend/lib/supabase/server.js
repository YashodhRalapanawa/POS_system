import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const serverAuthOptions = {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
};

/**
 * Validates and retrieves the Supabase server environment credentials.
 */
export function getSupabaseEnv() {
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be configured in environment variables.");
    }
    return { supabaseUrl, supabaseAnonKey };
}

/**
 * Creates a fresh server-side Supabase client with anonymous public key.
 * Does not share mutable session state across requests.
 */
export function createServerClient() {
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: serverAuthOptions,
    });
}

/**
 * Creates a user-scoped Supabase client applying the authenticated user's bearer token.
 * Enables Supabase Row Level Security (RLS) to enforce user policies on PostgreSQL queries.
 */
export function createUserClient(accessToken) {
    if (!accessToken) {
        throw new Error("Access token is required to create a user-scoped client.");
    }
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    return createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        },
        auth: serverAuthOptions,
    });
}

/**
 * Extracts a Bearer token from a Request object or Authorization header string.
 */
export function extractBearerToken(requestOrHeader) {
    let authHeader = "";
    if (typeof requestOrHeader === "string") {
        authHeader = requestOrHeader;
    } else if (requestOrHeader && typeof requestOrHeader.headers?.get === "function") {
        authHeader = requestOrHeader.headers.get("authorization") || "";
    }
    if (authHeader.startsWith("Bearer ")) {
        return authHeader.slice(7).trim();
    }
    return "";
}

/**
 * Verifies a user's access token with Supabase Auth.
 * Returns { user, error }
 */
export async function verifyUserToken(accessToken) {
    if (!accessToken) {
        return { user: null, error: new Error("Missing access token.") };
    }
    try {
        const client = createServerClient();
        const { data, error } = await client.auth.getUser(accessToken);
        if (error || !data?.user) {
            return { user: null, error: error || new Error("Invalid or expired session.") };
        }
        return { user: data.user, error: null };
    } catch (err) {
        return { user: null, error: err };
    }
}

/**
 * Convenience helper for Route Handlers: extracts token, verifies the user,
 * and creates a user-scoped client for RLS queries.
 * Returns { user, client, error }
 */
export async function getAuthenticatedUserAndClient(request) {
    const token = extractBearerToken(request);
    if (!token) {
        return { user: null, client: null, error: new Error("No authorization token provided.") };
    }
    const { user, error } = await verifyUserToken(token);
    if (error || !user) {
        return { user: null, client: null, error };
    }
    const client = createUserClient(token);
    return { user, client, error: null };
}

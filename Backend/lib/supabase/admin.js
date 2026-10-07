import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const serverAuthOptions = {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
};

/**
 * Checks whether the Supabase admin service role credentials are present.
 */
export function isSupabaseAdminConfigured() {
    return Boolean(supabaseUrl && serviceRoleKey);
}

/**
 * Creates a privileged admin Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Bypasses Row Level Security (RLS) for server-side administrative operations only.
 * Throws a descriptive error if the key is not set.
 */
export function getSupabaseAdmin() {
    if (!supabaseUrl) {
        throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is not configured.");
    }
    if (!serviceRoleKey) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.");
    }
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: serverAuthOptions,
    });
}

const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set in the backend environment.");
}

const serverAuthOptions = {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
};

// Shared anon client for calls that never sign anyone in (getUser, public RPCs).
const supabase = createClient(supabaseUrl, supabaseKey, { auth: serverAuthOptions });

// Service-role client: bypasses RLS. Server-side only; never send this key to the browser.
const supabaseAdmin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: serverAuthOptions })
    : null;

// A fresh client for sign-in, sign-up, refresh and password changes, so a session
// created for one request is never held by a client that another request reuses.
function createAuthClient() {
    return createClient(supabaseUrl, supabaseKey, { auth: serverAuthOptions });
}

// A client that acts as the signed-in user, so row-level security applies.
function createUserClient(accessToken) {
    return createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: serverAuthOptions,
    });
}

module.exports = { supabase, supabaseAdmin, supabaseUrl, createAuthClient, createUserClient };

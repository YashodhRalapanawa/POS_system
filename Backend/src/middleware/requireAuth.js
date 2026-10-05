const { supabase, createUserClient } = require("../supabase");

function getBearerToken(req) {
    const authorization = req.get("authorization") || "";
    return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

// Verifies the Supabase access token and attaches a client that acts as that user (RLS applies).
async function requireAuth(req, res, next) {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
        return res.status(401).json({ error: "Sign in to continue." });
    }

    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
        return res.status(401).json({ error: "Your session has expired. Sign in again." });
    }

    req.accessToken = accessToken;
    req.authUser = data.user;
    req.db = createUserClient(accessToken);
    return next();
}

module.exports = { requireAuth, getBearerToken };

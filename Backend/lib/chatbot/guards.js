import "server-only";

/**
 * Requests that ask for credentials or system internals. These are refused before the
 * model is called. (The model never receives secrets anyway; this just answers fast
 * and consistently.)
 */
const SECRET_REQUEST_PATTERNS = [
    /\b(api|secret|private|access|service[\s_-]?role|anon|publishable)[\s_-]?keys?\b/i,
    /\b(access|refresh|bearer|auth|session|jwt)[\s_-]?tokens?\b/i,
    /\bjwt\b/i,
    /\.env\b|\benv(ironment)?\s+(var(iable)?s?|file|config)\b/i,
    /\bconnection\s+string\b|\bdatabase\s+(url|password|credentials?)\b|\bdb\s+password\b/i,
    /\b(supabase|groq|postgres)\s+(url|key|password|credentials?|secret)\b/i,
    /\bcredentials?\b/i,
    /\b(system\s+prompt|your\s+(instructions|prompt|rules))\b/i,
    /\b(other|another|every|all)\s+(users?'?|staff|employees?'?|cashiers?'?)\s+(passwords?|pins?)\b/i,
    /\b(passwords?|pins?)\s+(of|for)\s+(other|another|all|every|the)\s+(users?|staff|employees?|cashiers?|admin)\b/i,
    /\b(what|tell|show|give|share|reveal)\b.{0,30}\b(my|his|her|their|the|admin'?s?)\s+(password|pin)\b/i,
];

export const SECRET_REFUSAL =
    "Sorry, I can't help with passwords, keys, tokens or other security details. 🔒 " +
    "I can help with your sales, stock, products, customers, returns or shifts. What would you like to know?";

export function isSecretRequest(text) {
    const value = String(text || "");
    return SECRET_REQUEST_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Last line of defence on the way out: masks anything that looks like a credential.
 */
const SECRET_OUTPUT_PATTERNS = [
    /\bgsk_[A-Za-z0-9]{20,}\b/g, // Groq keys
    /\bsk-[A-Za-z0-9_-]{20,}\b/g, // OpenAI/Anthropic-style keys
    /\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}\b/g, // Supabase keys
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWTs
    /\bpostgres(ql)?:\/\/\S+/gi, // connection strings
];

function configuredSecrets() {
    return [
        process.env.GROQ_API_KEY,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        process.env.SUPABASE_ANON_KEY,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ].filter((value) => typeof value === "string" && value.length >= 12);
}

export function redactSecrets(text) {
    let output = String(text || "");
    for (const secret of configuredSecrets()) {
        output = output.split(secret).join("[hidden]");
    }
    for (const pattern of SECRET_OUTPUT_PATTERNS) {
        output = output.replace(pattern, "[hidden]");
    }
    return output;
}

/**
 * Simple in-memory sliding-window limiter per user. Good enough for one server
 * process; use Redis/Postgres if the backend runs on several instances.
 */
const requestLog = new Map();

export function checkRateLimit(userId) {
    const limit = Number(process.env.CHAT_RATE_LIMIT_PER_MINUTE) || 15;
    const windowMs = 60_000;
    const now = Date.now();
    const recent = (requestLog.get(userId) || []).filter((time) => now - time < windowMs);

    if (recent.length >= limit) {
        requestLog.set(userId, recent);
        return { allowed: false, retryAfterSeconds: Math.ceil((windowMs - (now - recent[0])) / 1000) };
    }

    recent.push(now);
    requestLog.set(userId, recent);
    return { allowed: true };
}

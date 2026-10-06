const express = require("express");
const { supabaseAdmin, createAuthClient, createUserClient } = require("../supabase");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

// Same rules as the frontend (Frontend/src/components/auth/SignUpPage.jsx and passwordRules.js).
const BUSINESS_TYPES = ["Retail", "Electronics", "Grocery", "Pharmacy", "Restaurant", "Other"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9\s()-]{7,20}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{4,20}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

const INVALID_CREDENTIALS = "Incorrect email/username or password.";

function validatePassword(password) {
    if (!password) return "Password is required.";
    if (
        password.length < 8
        || !/[A-Z]/.test(password)
        || !/[0-9]/.test(password)
        || !/[^A-Za-z0-9]/.test(password)
    ) {
        return "Password needs at least 8 characters, an uppercase letter, a number and a special character.";
    }
    return "";
}

function frontendUrl() {
    return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

function toSession(session) {
    return {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresAt: session.expires_at,
    };
}

// Profile in the shape the frontend's AuthContext already uses (see authUsers in mockUsers.js).
async function loadProfile(db, userId) {
    const [{ data: profile, error }, { data: permissions, error: permissionsError }] = await Promise.all([
        db
            .from("users")
            .select(`
                id, full_name, email, username, employee_code, phone, avatar_url, status,
                last_login, created_at, all_registers,
                role:roles (name),
                store:stores (id, name, code),
                preferences:user_preferences (landing_page, date_format, ask_before_printing, sale_sound, table_density)
            `)
            .eq("id", userId)
            .single(),
        db.rpc("current_user_permissions"),
    ]);
    if (error) throw error;
    if (permissionsError) throw permissionsError;

    const preferences = profile.preferences || {};
    return {
        id: profile.id,
        employeeCode: profile.employee_code,
        fullName: profile.full_name,
        email: profile.email,
        username: profile.username,
        role: profile.role?.name,
        status: profile.status,
        storeId: profile.store?.id,
        storeName: profile.store?.name,
        lastLogin: profile.last_login,
        phone: profile.phone,
        memberSince: profile.created_at,
        avatarUrl: profile.avatar_url,
        allRegisters: profile.all_registers,
        permissions: permissions || [],
        preferences: {
            landingPage: preferences.landing_page,
            dateFormat: preferences.date_format,
            askBeforePrinting: preferences.ask_before_printing,
            saleSound: preferences.sale_sound,
            tableDensity: preferences.table_density,
        },
    };
}

// Supabase Auth signs in by email, so usernames are looked up with the service role.
async function resolveLoginEmail(identifier) {
    if (identifier.includes("@")) return identifier.toLowerCase();
    if (!supabaseAdmin) return null;

    const { data, error } = await supabaseAdmin.rpc("get_login_email", { p_identifier: identifier });
    if (error) throw error;
    return data || null;
}

async function recordFailedSignIn(email, req) {
    if (!supabaseAdmin) return;
    const { data: user } = await supabaseAdmin
        .from("users")
        .select("id, store_id")
        .eq("email", email)
        .maybeSingle();
    if (!user) return;

    await supabaseAdmin.from("activity_logs").insert({
        store_id: user.store_id,
        user_id: user.id,
        entity_type: "user",
        entity_id: user.id,
        action: "Failed sign-in attempt",
        description: "Incorrect password",
        ip_address: req.ip || null,
        user_agent: req.get("user-agent") || null,
    });
}

async function revokeSession(accessToken) {
    if (supabaseAdmin) {
        await supabaseAdmin.auth.admin.signOut(accessToken, "local");
    }
}

// Sign Up: creates the business, its first store and the Admin (database trigger
// handle_new_auth_user). Does not sign the user in, matching the frontend.
router.post("/signup", async (req, res) => {
    const body = req.body || {};
    const values = {
        businessName: String(body.businessName || "").trim(),
        businessType: String(body.businessType || "Retail").trim(),
        businessPhone: String(body.businessPhone || "").trim(),
        country: String(body.country || "Sri Lanka").trim(),
        currency: String(body.currency || "USD").trim().toUpperCase(),
        fullName: String(body.fullName || "").trim(),
        email: String(body.email || "").trim().toLowerCase(),
        username: String(body.username || "").trim(),
        password: String(body.password || ""),
    };

    const errors = {};
    if (!values.businessName) errors.businessName = "Business name is required.";
    if (!BUSINESS_TYPES.includes(values.businessType)) errors.businessType = "Choose a business type.";
    if (values.businessPhone && !PHONE_PATTERN.test(values.businessPhone)) errors.businessPhone = "Enter a valid phone number.";
    if (!CURRENCY_PATTERN.test(values.currency)) errors.currency = "Choose a currency.";
    if (!values.fullName) errors.fullName = "Full name is required.";
    if (!EMAIL_PATTERN.test(values.email)) errors.email = "Enter a valid email address.";
    if (!USERNAME_PATTERN.test(values.username)) errors.username = "Username must be 4–20 letters, numbers or underscores.";
    const passwordError = validatePassword(values.password);
    if (passwordError) errors.password = passwordError;
    if (body.agreeTerms !== true) errors.agreeTerms = "You must accept the terms to continue.";
    if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: "Please fix the highlighted fields.", fields: errors });
    }

    // Without the service role the check is skipped; the unique index still rejects duplicates.
    const { data: usernameFree, error: usernameError } = supabaseAdmin
        ? await supabaseAdmin.rpc("username_available", { p_username: values.username })
        : { data: true, error: null };
    if (usernameError) throw usernameError;
    if (!usernameFree) {
        return res.status(409).json({ error: "This username is already taken.", fields: { username: "This username is already taken." } });
    }

    const { data, error } = await createAuthClient().auth.signUp({
        email: values.email,
        password: values.password,
        options: {
            emailRedirectTo: `${frontendUrl()}/login`,
            data: {
                business_name: values.businessName,
                business_type: values.businessType,
                business_phone: values.businessPhone,
                country: values.country,
                currency: values.currency,
                full_name: values.fullName,
                username: values.username,
            },
        },
    });
    if (error) {
        if (error.code === "user_already_exists" || /already registered/i.test(error.message)) {
            return res.status(409).json({ error: "An account with this email already exists.", fields: { email: "An account with this email already exists." } });
        }
        if (error.code === "email_address_invalid") {
            return res.status(400).json({ error: "Enter a valid email address.", fields: { email: "This email address can't be used." } });
        }
        if (error.code === "over_email_send_rate_limit") {
            return res.status(429).json({ error: "Too many sign-ups right now. Try again in a few minutes." });
        }
        if (error.code === "weak_password") {
            return res.status(400).json({ error: error.message, fields: { password: error.message } });
        }
        console.error("Sign-up failed:", error);
        return res.status(400).json({ error: "Could not create the account. Check the details and try again." });
    }

    return res.status(201).json({
        message: `Account created. Your store '${values.businessName}' is ready.`,
        email: values.email,
        emailConfirmationRequired: !data.session,
    });
});

// Login with email or username. Inactive and Locked accounts are refused by record_sign_in().
router.post("/login", async (req, res) => {
    const identifier = String(req.body?.identifier ?? req.body?.email ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!identifier || !password) {
        return res.status(400).json({ error: "Enter your email or username and your password." });
    }
    if (!identifier.includes("@") && !supabaseAdmin) {
        return res.status(400).json({ error: "Sign in with your email address." });
    }

    const email = await resolveLoginEmail(identifier);
    if (!email) {
        return res.status(401).json({ error: INVALID_CREDENTIALS });
    }

    const { data, error } = await createAuthClient().auth.signInWithPassword({ email, password });
    if (error) {
        if (error.code === "email_not_confirmed") {
            return res.status(403).json({ error: "Confirm your email address before signing in." });
        }
        await recordFailedSignIn(email, req);
        return res.status(401).json({ error: INVALID_CREDENTIALS });
    }

    const accessToken = data.session.access_token;
    const db = createUserClient(accessToken);
    const { error: signInError } = await db.rpc("record_sign_in");
    if (signInError) {
        await revokeSession(accessToken);
        return res.status(403).json({ error: signInError.message });
    }

    const user = await loadProfile(db, data.user.id);
    return res.json({ session: toSession(data.session), user });
});

// Exchanges a refresh token for a new session; refuses accounts deactivated since sign-in.
router.post("/refresh", async (req, res) => {
    const refreshToken = String(req.body?.refreshToken || "");
    if (!refreshToken) {
        return res.status(400).json({ error: "A refresh token is required." });
    }

    const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
        return res.status(401).json({ error: "Your session has expired. Sign in again." });
    }

    const db = createUserClient(data.session.access_token);
    const { data: profile } = await db.from("users").select("status").eq("id", data.user.id).maybeSingle();
    if (!profile || profile.status !== "Active") {
        await revokeSession(data.session.access_token);
        return res.status(403).json({ error: "This account is no longer active." });
    }

    return res.json({ session: toSession(data.session) });
});

router.get("/me", requireAuth, async (req, res) => {
    const user = await loadProfile(req.db, req.authUser.id);
    if (user.status !== "Active") {
        return res.status(403).json({ error: `This account is ${user.status.toLowerCase()}.` });
    }
    return res.json({ user });
});

router.post("/logout", requireAuth, async (req, res) => {
    const { data: profile } = await req.db.from("users").select("store_id").eq("id", req.authUser.id).maybeSingle();
    if (profile) {
        await req.db.from("activity_logs").insert({
            store_id: profile.store_id,
            user_id: req.authUser.id,
            entity_type: "user",
            entity_id: req.authUser.id,
            action: "Signed out",
            description: String(req.body?.reason || ""),
        });
    }
    await revokeSession(req.accessToken);
    return res.status(204).end();
});

// Always answers the same way, so it can't be used to find out which emails have accounts.
router.post("/forgot-password", async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ error: "Enter a valid email address." });
    }

    const redirectTo = process.env.PASSWORD_RESET_REDIRECT_URL || `${frontendUrl()}/login`;
    const { error } = await createAuthClient().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
        console.error("Password reset email failed:", error.message);
    }
    return res.json({ message: "If an account exists for that email, a reset link has been sent." });
});

// Completes a reset: the frontend passes the tokens from the emailed recovery link.
router.post("/reset-password", async (req, res) => {
    const accessToken = String(req.body?.accessToken || "");
    const refreshToken = String(req.body?.refreshToken || "");
    const password = String(req.body?.password || "");
    if (!accessToken || !refreshToken) {
        return res.status(400).json({ error: "The reset link is invalid or has expired." });
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
        return res.status(400).json({ error: passwordError, fields: { password: passwordError } });
    }

    const client = createAuthClient();
    const { error: sessionError } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (sessionError) {
        return res.status(400).json({ error: "The reset link is invalid or has expired." });
    }
    const { error } = await client.auth.updateUser({ password });
    if (error) {
        return res.status(400).json({ error: error.message });
    }
    await client.auth.signOut({ scope: "global" });
    return res.json({ message: "Your password has been reset. Sign in with your new password." });
});

// My Profile > Change password: checks the current password first.
router.post("/change-password", requireAuth, async (req, res) => {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    const passwordError = validatePassword(newPassword);
    if (!currentPassword) {
        return res.status(400).json({ error: "Enter your current password.", fields: { currentPassword: "Enter your current password." } });
    }
    if (passwordError) {
        return res.status(400).json({ error: passwordError, fields: { newPassword: passwordError } });
    }
    if (newPassword === currentPassword) {
        return res.status(400).json({ error: "Choose a password you haven't just used.", fields: { newPassword: "Choose a different password." } });
    }

    const client = createAuthClient();
    const { data: verified, error: verifyError } = await client.auth.signInWithPassword({
        email: req.authUser.email,
        password: currentPassword,
    });
    if (verifyError) {
        return res.status(400).json({ error: "Your current password is incorrect.", fields: { currentPassword: "Your current password is incorrect." } });
    }
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) {
        return res.status(400).json({ error: error.message });
    }

    const { data: profile } = await req.db.from("users").select("store_id").eq("id", req.authUser.id).maybeSingle();
    if (profile) {
        await req.db.from("activity_logs").insert({
            store_id: profile.store_id,
            user_id: req.authUser.id,
            entity_type: "user",
            entity_id: req.authUser.id,
            action: "Password changed",
            description: "Changed from My Profile",
        });
    }
    // Every other session, including the one that made this request, is ended;
    // the frontend continues with the session returned here.
    await client.auth.signOut({ scope: "others" });
    return res.json({
        message: "Password changed. Other devices have been signed out.",
        session: toSession(verified.session),
    });
});

module.exports = router;

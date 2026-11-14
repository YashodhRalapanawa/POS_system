import { createServerClient } from "../../../../lib/supabase/server.js";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";

export const dynamic = "force-dynamic";

const BUSINESS_TYPES = ["Retail", "Electronics", "Grocery", "Pharmacy", "Restaurant", "Other"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9\s()-]{7,20}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{4,20}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function validatePassword(password) {
    if (!password) return "Password is required.";
    if (
        password.length < 8
        || !/[A-Z]/.test(password)
        || !/[0-9]/.test(password)
        || !/[^A-Za-z0-9]/.test(password)
    ) {
        return "Password needs at least 8 characters, an uppercase letter, a number, and a special character.";
    }
    return "";
}

function frontendUrl() {
    return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

/**
 * POST /api/auth/signup
 * Registers the initial Store Owner (Admin) and sets up the business & store.
 * If an Admin already exists, public self-registration is blocked for security.
 */
export async function POST(request) {
    try {
        if (!isSupabaseAdminConfigured()) {
            return Response.json(
                { success: false, error: "Database configuration is missing on server." },
                { status: 503 }
            );
        }

        const admin = getSupabaseAdmin();

        // 1. Security Check: Has initial setup already been completed?
        let adminExists = false;
        try {
            const { count: adminCount } = await admin
                .from("users")
                .select("id, role:roles!inner(name)", { count: "exact", head: true })
                .eq("roles.name", "Admin");

            if (adminCount && adminCount > 0) {
                adminExists = true;
            } else {
                const { count: totalCount } = await admin
                    .from("users")
                    .select("id", { count: "exact", head: true });
                if (totalCount && totalCount > 0) {
                    adminExists = true;
                }
            }
        } catch {
            // Proceed to checks
        }

        if (adminExists) {
            return Response.json(
                {
                    success: false,
                    error: "Initial setup has already been completed. Only an administrator can add new staff accounts from the Dashboard.",
                },
                { status: 403 }
            );
        }

        // 2. Parse & Validate Request Body
        let body;
        try {
            body = await request.json();
        } catch {
            return Response.json(
                { success: false, error: "Invalid JSON request body." },
                { status: 400 }
            );
        }

        const values = {
            businessName: String(body?.businessName || "").trim(),
            businessType: String(body?.businessType || "Retail").trim(),
            businessPhone: String(body?.businessPhone || "").trim(),
            country: String(body?.country || "Sri Lanka").trim(),
            currency: String(body?.currency || "USD").trim().toUpperCase(),
            fullName: String(body?.fullName || "").trim(),
            email: String(body?.email || "").trim().toLowerCase(),
            username: String(body?.username || "").trim(),
            password: String(body?.password || ""),
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

        if (body?.agreeTerms !== true) errors.agreeTerms = "You must accept the terms to continue.";

        if (Object.keys(errors).length > 0) {
            return Response.json(
                { success: false, error: "Please fix the highlighted fields.", fields: errors },
                { status: 400 }
            );
        }

        // 3. Check username availability
        try {
            const { data: usernameFree, error: usernameErr } = await admin.rpc("username_available", {
                p_username: values.username,
            });
            if (!usernameErr && usernameFree === false) {
                return Response.json(
                    {
                        success: false,
                        error: "This username is already taken.",
                        fields: { username: "This username is already taken." },
                    },
                    { status: 409 }
                );
            }
        } catch {
            // Unique constraint on public.users will still catch duplicates
        }

        // 4. Create User in Supabase Auth
        // The trigger handle_new_auth_user() will automatically create the business,
        // store, default register, store_settings, and assign the 'Admin' role!
        const authClient = createServerClient();
        const { data, error } = await authClient.auth.signUp({
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
                return Response.json(
                    {
                        success: false,
                        error: "An account with this email already exists.",
                        fields: { email: "An account with this email already exists." },
                    },
                    { status: 409 }
                );
            }
            if (error.code === "email_address_invalid") {
                return Response.json(
                    {
                        success: false,
                        error: "Enter a valid email address.",
                        fields: { email: "This email address can't be used." },
                    },
                    { status: 400 }
                );
            }
            if (error.code === "over_email_send_rate_limit") {
                return Response.json(
                    { success: false, error: "Too many sign-ups right now. Try again in a few minutes." },
                    { status: 429 }
                );
            }
            return Response.json(
                { success: false, error: error.message || "Could not create account. Check the details and try again." },
                { status: 400 }
            );
        }

        return Response.json(
            {
                success: true,
                message: `Account created. Your store '${values.businessName}' has been initialized with Admin privileges.`,
                email: values.email,
                emailConfirmationRequired: !data.session,
            },
            { status: 201 }
        );
    } catch (err) {
        return Response.json(
            { success: false, error: err.message || "Failed to process sign up." },
            { status: 500 }
        );
    }
}


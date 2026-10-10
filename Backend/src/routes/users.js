const express = require("express");
const crypto = require("node:crypto");
const { supabaseAdmin } = require("../supabase");
const { requireAuth } = require("../middleware/requireAuth");

const router = express.Router();

const STAFF_ROLES = ["Admin", "Manager", "Cashier"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{4,20}$/;

// Creates a staff account in the admin's own store. The store and role travel in
// app_metadata, which only the service role can set; the handle_new_auth_user trigger
// turns them into the users row.
router.post("/", requireAuth, async (req, res) => {
    if (!supabaseAdmin) {
        return res.status(503).json({ error: "Set SUPABASE_SERVICE_ROLE_KEY on the backend to create staff accounts." });
    }

    const { data: canManageUsers, error: permissionError } = await req.db.rpc("has_permission", {
        p_key: "users.manage",
    });
    if (permissionError) throw permissionError;
    if (!canManageUsers) {
        return res.status(403).json({ error: "Only an administrator can create staff accounts." });
    }

    const body = req.body || {};
    const fullName = String(body.fullName || body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const username = String(body.username || "").trim();
    const role = body.role === "Administrator" ? "Admin" : String(body.role || "");
    const employeeCode = String(body.employeeCode || body.employeeId || "").trim();
    const registerAccess = String(body.registerAccess || "None").trim();

    const errors = {};
    if (!fullName) errors.fullName = "Full name is required.";
    if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";
    if (username && !USERNAME_PATTERN.test(username)) errors.username = "Username must be 4–20 letters, numbers or underscores.";
    if (!STAFF_ROLES.includes(role)) errors.role = `Role must be one of: ${STAFF_ROLES.join(", ")}.`;
    if (Object.keys(errors).length > 0) {
        return res.status(400).json({ error: "Please fix the highlighted fields.", fields: errors });
    }

    const { data: admin, error: adminError } = await req.db
        .from("users")
        .select("store_id")
        .eq("id", req.authUser.id)
        .single();
    if (adminError) throw adminError;

    const temporaryPassword = `${crypto.randomBytes(12).toString("base64url")}A1!`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
    });
    if (error) {
        if (error.code === "email_exists" || /already been registered/i.test(error.message)) {
            return res.status(409).json({ error: "An account with this email already exists.", fields: { email: "An account with this email already exists." } });
        }
        if (error.code === "email_address_invalid") {
            return res.status(400).json({ error: "Enter a valid email address.", fields: { email: "This email address can't be used." } });
        }
        console.error("Could not create staff account:", error);
        return res.status(400).json({ error: "Could not create the staff account. Check the details and try again." });
    }

    // The sign-up trigger ignores accounts without a business name, so the profile is created here.
    const { error: profileError } = await supabaseAdmin.rpc("create_staff_profile", {
        p_user_id: data.user.id,
        p_store_id: admin.store_id,
        p_role: role,
        p_full_name: fullName,
        p_username: username || null,
        p_employee_code: employeeCode || null,
        p_phone: String(body.phone || "").trim(),
        p_register_access: registerAccess,
    });
    if (profileError) {
        await supabaseAdmin.auth.admin.deleteUser(data.user.id);
        if (profileError.code === "23505") {
            const field = /username/.test(profileError.message) ? "username" : "employeeCode";
            const message = field === "username" ? "This username is already taken." : "This employee code is already in use.";
            return res.status(409).json({ error: message, fields: { [field]: message } });
        }
        console.error("Could not create staff profile:", profileError);
        return res.status(400).json({ error: "Could not create the staff account. Check the details and try again." });
    }

    await supabaseAdmin.from("activity_logs").insert({
        store_id: admin.store_id,
        user_id: req.authUser.id,
        entity_type: "user",
        entity_id: data.user.id,
        action: "Created",
        description: `Created ${role} account for ${fullName}`,
    });

    // Shown once to the admin, who passes it on; the staff member should change it after signing in.
    return res.status(201).json({
        userId: data.user.id,
        email: data.user.email,
        role,
        temporaryPassword,
    });
});

module.exports = router;

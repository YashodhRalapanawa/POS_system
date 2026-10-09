import "server-only";

/**
 * Loads the staff profile and permissions for an authenticated user.
 * Queries public.users through the user-scoped Supabase client to enforce RLS.
 */
export async function loadStaffProfile(db, userId) {
    let profile;
    let permissions = [];

    try {
        const [{ data: prof, error }, { data: perms }] = await Promise.all([
            db
                .from("users")
                .select(`
                    id, full_name, email, username, employee_code, phone, avatar_url, status,
                    last_login, created_at, all_registers, role_id,
                    role:roles (id, name, code),
                    store:stores (id, name, code),
                    preferences:user_preferences (landing_page, date_format, ask_before_printing, sale_sound, table_density)
                `)
                .eq("id", userId)
                .maybeSingle(),
            db.rpc("current_user_permissions"),
        ]);

        if (error) {
            // Fallback for environments where code column is not yet present on roles
            const { data: fallbackProf, error: fallbackError } = await db
                .from("users")
                .select(`
                    id, full_name, email, username, employee_code, phone, avatar_url, status,
                    last_login, created_at, all_registers, role_id,
                    role:roles (id, name),
                    store:stores (id, name, code),
                    preferences:user_preferences (landing_page, date_format, ask_before_printing, sale_sound, table_density)
                `)
                .eq("id", userId)
                .maybeSingle();

            if (fallbackError) throw fallbackError;
            profile = fallbackProf;
        } else {
            profile = prof;
        }
        permissions = perms || [];
    } catch (err) {
        throw err;
    }

    if (!profile) {
        return null;
    }

    const roleObj = {
        id: profile.role?.id ?? profile.role_id,
        name: profile.role?.name || "Staff",
        code: profile.role?.code || (profile.role?.name ? profile.role.name.toUpperCase().replace(/\s+/g, "_") : "STAFF"),
    };

    const preferences = profile.preferences || {};
    return {
        id: profile.id,
        authUserId: userId,
        employeeCode: profile.employee_code,
        fullName: profile.full_name,
        email: profile.email,
        username: profile.username,
        role: roleObj,
        roleName: roleObj.name,
        roleCode: roleObj.code,
        roleId: roleObj.id,
        status: profile.status,
        isActive: profile.status === "Active",
        storeId: profile.store?.id || null,
        storeName: profile.store?.name || null,
        store: profile.store || null,
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

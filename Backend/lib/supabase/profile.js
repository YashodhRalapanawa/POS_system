import "server-only";

/**
 * Loads the staff profile and permissions for an authenticated user.
 * Queries public.users through the user-scoped Supabase client to enforce RLS.
 */
export async function loadStaffProfile(db, userId) {
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
            .maybeSingle(),
        db.rpc("current_user_permissions"),
    ]);

    if (error) {
        throw error;
    }
    if (!profile) {
        return null;
    }
    if (permissionsError) {
        // Silently default permissions if RPC encounters an issue
    }

    const preferences = profile.preferences || {};
    return {
        id: profile.id,
        authUserId: userId,
        employeeCode: profile.employee_code,
        fullName: profile.full_name,
        email: profile.email,
        username: profile.username,
        role: profile.role?.name || "Staff",
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

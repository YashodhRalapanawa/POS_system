import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

/**
 * Derives a human-readable name from a permission key if none is stored in DB.
 * e.g. "products.view" -> "View Products"
 */
function derivePermissionName(key) {
    if (!key) return "";
    const parts = key.split(".");
    if (parts.length === 2) {
        const [module, action] = parts;
        const formattedAction = action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const formattedModule = module.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        return `${formattedAction} ${formattedModule}`;
    }
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Derives a module name from a permission key if none is stored in DB.
 * e.g. "products.view" -> "Products"
 */
function derivePermissionModule(key) {
    if (!key) return "General";
    const parts = key.split(".");
    if (parts.length > 1) {
        return parts[0].replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return "General";
}

/**
 * GET /api/permissions
 * Retrieves all active/configurable system permissions.
 * Requires "roles.view" permission.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, "roles.view");
        if (!auth.authorized) {
            return auth.response;
        }

        // Query permissions table
        let list = [];
        const { data: permissions, error } = await auth.client
            .from("permissions")
            .select("id, key, description, module, name, created_at")
            .order("id", { ascending: true });

        if (error) {
            // Fallback for environments where module/name migration columns are not yet added
            const { data: fallbackPerms, error: fallbackError } = await auth.client
                .from("permissions")
                .select("id, key, description, created_at")
                .order("id", { ascending: true });

            if (fallbackError) {
                return Response.json(
                    { success: false, message: "Failed to retrieve permissions." },
                    { status: 500 }
                );
            }
            list = fallbackPerms || [];
        } else {
            list = permissions || [];
        }

        const formattedPermissions = list.map((p) => {
            const code = p.key;
            return {
                id: p.id,
                code,
                key: p.key,
                name: p.name || derivePermissionName(code),
                module: p.module || derivePermissionModule(code),
                description: p.description || "",
            };
        });

        return Response.json(
            {
                success: true,
                message: "Permissions retrieved successfully",
                data: {
                    permissions: formattedPermissions,
                },
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Something went wrong while retrieving permissions." },
            { status: 500 }
        );
    }
}

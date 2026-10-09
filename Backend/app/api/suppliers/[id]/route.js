import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/suppliers/[id]
 * Updates supplier details or active/inactive status.
 *
 * Requirements:
 *  - Supabase authentication required
 *  - suppliers.update (or suppliers.manage fallback) permission required
 *  - Validates supplier exists
 *  - Updates only submitted fields
 *  - Prevents duplicate supplier code/name within the same store
 *  - Preserves product relationships
 *  - Returns updated supplier record
 */
export async function PATCH(request, context) {
    try {
        const auth = await requireAuthAndPermission(request, ["suppliers.update", "suppliers.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const params = await context?.params;
        const supplierId = params?.id;
        if (!supplierId) {
            return Response.json(
                { success: false, message: "Supplier ID is required." },
                { status: 400 }
            );
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return Response.json(
                { success: false, message: "Invalid JSON request body." },
                { status: 400 }
            );
        }

        if (!isSupabaseAdminConfigured()) {
            return Response.json(
                { success: false, message: "Server database configuration is missing." },
                { status: 503 }
            );
        }

        const admin = getSupabaseAdmin();

        // 1. Fetch current supplier
        const { data: currentSupplier, error: fetchErr } = await admin
            .from("suppliers")
            .select("*")
            .eq("id", supplierId)
            .maybeSingle();

        if (fetchErr) {
            return Response.json(
                { success: false, message: `Failed to query supplier: ${fetchErr.message}` },
                { status: 500 }
            );
        }

        if (!currentSupplier) {
            return Response.json(
                { success: false, message: "Supplier not found." },
                { status: 404 }
            );
        }

        const updates = {
            updated_at: new Date().toISOString(),
        };

        // 2. Validate and handle Supplier Name
        if (body.name !== undefined) {
            const newName = String(body.name).trim();
            if (!newName) {
                return Response.json(
                    { success: false, message: "Supplier name cannot be empty." },
                    { status: 400 }
                );
            }

            if (newName.toLowerCase() !== currentSupplier.name.toLowerCase()) {
                const { data: duplicateName } = await admin
                    .from("suppliers")
                    .select("id")
                    .eq("store_id", currentSupplier.store_id)
                    .ilike("name", newName)
                    .neq("id", supplierId)
                    .maybeSingle();

                if (duplicateName) {
                    return Response.json(
                        { success: false, message: `A supplier named "${newName}" already exists.` },
                        { status: 409 }
                    );
                }
            }
            updates.name = newName;
        }

        // 3. Validate and handle Supplier Code
        if (body.code !== undefined) {
            const rawCode = String(body.code || "").trim();
            if (!rawCode) {
                return Response.json(
                    { success: false, message: "Supplier code cannot be empty." },
                    { status: 400 }
                );
            }
            const newCode = rawCode.toUpperCase();

            if (newCode !== currentSupplier.code.toUpperCase()) {
                const { data: duplicateCode } = await admin
                    .from("suppliers")
                    .select("id")
                    .eq("store_id", currentSupplier.store_id)
                    .ilike("code", newCode)
                    .neq("id", supplierId)
                    .maybeSingle();

                if (duplicateCode) {
                    return Response.json(
                        { success: false, message: `Supplier code "${newCode}" is already in use.` },
                        { status: 409 }
                    );
                }
            }
            updates.code = newCode;
        }

        // 4. Validate and handle Email
        if (body.email !== undefined) {
            const rawEmail = String(body.email || "").trim().toLowerCase();
            if (rawEmail && !/^\S+@\S+\.\S+$/.test(rawEmail)) {
                return Response.json(
                    { success: false, message: "Please enter a valid email address." },
                    { status: 400 }
                );
            }
            updates.email = rawEmail;
        }

        // 5. Contact Person, Phone, Address, City, Country
        if (body.contactPerson !== undefined || body.contact_person !== undefined) {
            updates.contact_person = String(body.contactPerson ?? body.contact_person ?? "").trim();
        }

        if (body.phone !== undefined) {
            updates.phone = String(body.phone || "").trim();
        }

        if (body.address !== undefined) {
            updates.address = String(body.address || "").trim();
        }

        if (body.city !== undefined) {
            updates.city = String(body.city || "").trim();
        }

        if (body.country !== undefined) {
            updates.country = String(body.country || "").trim();
        }

        if (body.supplierType !== undefined || body.supplier_type !== undefined) {
            const st = body.supplierType || body.supplier_type;
            const allowed = ["Manufacturer", "Distributor", "Wholesaler", "Local Supplier"];
            if (allowed.includes(st)) {
                updates.supplier_type = st;
            }
        }

        // 6. Validate and handle Active Status
        if (typeof body.isActive === "boolean") {
            updates.status = body.isActive ? "Active" : "Inactive";
        } else if (typeof body.status === "string") {
            const s = body.status.trim();
            if (["Active", "Inactive"].includes(s)) {
                updates.status = s;
            }
        }

        // 7. Execute update in Supabase
        const { data: updated, error: updateErr } = await admin
            .from("suppliers")
            .update(updates)
            .eq("id", supplierId)
            .select("*")
            .maybeSingle();

        if (updateErr) {
            return Response.json(
                { success: false, message: `Failed to update supplier: ${updateErr.message}` },
                { status: 500 }
            );
        }

        // Query product count for this supplier
        const { count: productCount } = await admin
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("supplier_id", supplierId);

        const formatted = {
            id: updated.id,
            code: updated.code,
            name: updated.name,
            contactPerson: updated.contact_person || "",
            email: updated.email || "",
            phone: updated.phone || "",
            address: updated.address || "",
            city: updated.city || "",
            country: updated.country || "",
            supplierType: updated.supplier_type,
            status: updated.status,
            isActive: updated.status === "Active",
            productCount: productCount || 0,
            storeId: updated.store_id,
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
        };

        return Response.json(
            {
                success: true,
                message: "Supplier updated successfully.",
                data: {
                    supplier: formatted,
                },
                supplier: formatted,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Internal server error while updating supplier." },
            { status: 500 }
        );
    }
}

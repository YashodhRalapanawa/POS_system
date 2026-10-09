import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/customers/[id]
 * Retrieves details for a specific customer.
 *
 * Requirements:
 *  - Supabase authentication required
 *  - customers.view (or customers.manage fallback) permission required
 *  - Controlled 404 response for invalid or non-existent customer ID
 *  - Store scoping enforced
 *  - No unrelated financial info
 */
export async function GET(request, context) {
    try {
        const auth = await requireAuthAndPermission(request, ["customers.view", "customers.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const params = await context?.params;
        const customerId = params?.id;
        if (!customerId) {
            return Response.json(
                { success: false, message: "Customer ID is required." },
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

        // 1. Query customer details (attempting with view for order_count)
        let { data: customer, error } = await admin
            .from("customers_with_order_counts")
            .select("*")
            .eq("id", customerId)
            .maybeSingle();

        if (error || !customer) {
            const fallback = await admin
                .from("customers")
                .select("*")
                .eq("id", customerId)
                .maybeSingle();

            if (fallback.error || !fallback.data) {
                return Response.json(
                    { success: false, message: "Customer not found." },
                    { status: 404 }
                );
            }
            customer = { ...fallback.data, order_count: 0 };
        }

        // Store scoping: prevent accessing customer belonging to another store
        const userStoreId = auth.user?.storeId || auth.user?.store_id;
        if (userStoreId && customer.store_id !== userStoreId) {
            return Response.json(
                { success: false, message: "Customer not found." },
                { status: 404 }
            );
        }

        const formatted = {
            id: customer.id,
            code: customer.code,
            name: customer.name,
            customerType: customer.customer_type || "Individual",
            phone: customer.phone || "",
            email: customer.email || "",
            address: customer.address || "",
            city: customer.city || "",
            country: customer.country || "",
            isWalkIn: Boolean(customer.is_walk_in),
            status: customer.status || "Active",
            isActive: customer.status === "Active",
            orderCount: Number(customer.order_count ?? 0),
            storeId: customer.store_id,
            createdAt: customer.created_at || null,
            updatedAt: customer.updated_at || null,
        };

        return Response.json(
            {
                success: true,
                message: "Customer retrieved successfully.",
                data: {
                    customer: formatted,
                },
                customer: formatted,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Internal server error while fetching customer." },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/customers/[id]
 * Updates customer information or toggles active/inactive status.
 *
 * Requirements:
 *  - Supabase authentication required
 *  - customers.update (or customers.manage fallback) permission required
 *  - Updates only submitted fields
 *  - Prevents duplicate customer codes within the same store
 *  - Preserves historical relationships
 *  - Prevents deactivating default walk-in customer
 *  - Returns updated customer record
 */
export async function PATCH(request, context) {
    try {
        const auth = await requireAuthAndPermission(request, ["customers.update", "customers.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        const params = await context?.params;
        const customerId = params?.id;
        if (!customerId) {
            return Response.json(
                { success: false, message: "Customer ID is required." },
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

        // 1. Fetch current customer
        const { data: currentCustomer, error: fetchErr } = await admin
            .from("customers")
            .select("*")
            .eq("id", customerId)
            .maybeSingle();

        if (fetchErr) {
            return Response.json(
                { success: false, message: `Failed to query customer: ${fetchErr.message}` },
                { status: 500 }
            );
        }

        if (!currentCustomer) {
            return Response.json(
                { success: false, message: "Customer not found." },
                { status: 404 }
            );
        }

        // Store scoping
        const userStoreId = auth.user?.storeId || auth.user?.store_id;
        if (userStoreId && currentCustomer.store_id !== userStoreId) {
            return Response.json(
                { success: false, message: "Customer not found." },
                { status: 404 }
            );
        }

        const updates = {
            updated_at: new Date().toISOString(),
        };

        // 2. Validate and handle Customer Name
        if (body.name !== undefined) {
            const newName = String(body.name).trim();
            if (!newName) {
                return Response.json(
                    { success: false, message: "Customer name cannot be empty." },
                    { status: 400 }
                );
            }
            updates.name = newName;
        }

        // 3. Validate and handle Customer Code
        if (body.code !== undefined) {
            const rawCode = String(body.code || "").trim();
            if (!rawCode) {
                return Response.json(
                    { success: false, message: "Customer code cannot be empty." },
                    { status: 400 }
                );
            }
            const newCode = rawCode.toUpperCase();

            if (newCode !== currentCustomer.code.toUpperCase()) {
                const { data: duplicateCode } = await admin
                    .from("customers")
                    .select("id")
                    .eq("store_id", currentCustomer.store_id)
                    .ilike("code", newCode)
                    .neq("id", customerId)
                    .maybeSingle();

                if (duplicateCode) {
                    return Response.json(
                        { success: false, message: `Customer code "${newCode}" is already in use.` },
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

        // 5. Customer Type
        if (body.customerType !== undefined || body.customer_type !== undefined) {
            const ct = body.customerType || body.customer_type;
            if (["Individual", "Business"].includes(ct)) {
                updates.customer_type = ct;
            }
        }

        // 6. Phone, Address, City, Country
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

        // 7. Validate and handle Active Status
        if (typeof body.isActive === "boolean") {
            const targetStatus = body.isActive ? "Active" : "Inactive";
            if (targetStatus === "Inactive" && currentCustomer.is_walk_in) {
                return Response.json(
                    { success: false, message: "The default walk-in customer account cannot be deactivated." },
                    { status: 400 }
                );
            }
            updates.status = targetStatus;
        } else if (typeof body.status === "string") {
            const targetStatus = body.status.trim();
            if (["Active", "Inactive"].includes(targetStatus)) {
                if (targetStatus === "Inactive" && currentCustomer.is_walk_in) {
                    return Response.json(
                        { success: false, message: "The default walk-in customer account cannot be deactivated." },
                        { status: 400 }
                    );
                }
                updates.status = targetStatus;
            }
        }

        // 8. Execute update in Supabase
        const { data: updated, error: updateErr } = await admin
            .from("customers")
            .update(updates)
            .eq("id", customerId)
            .select("*")
            .maybeSingle();

        if (updateErr) {
            return Response.json(
                { success: false, message: `Failed to update customer: ${updateErr.message}` },
                { status: 500 }
            );
        }

        // Query order count
        const { count: orderCount } = await admin
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("customer_id", customerId)
            .in("status", ["Completed", "Refunded"]);

        const formatted = {
            id: updated.id,
            code: updated.code,
            name: updated.name,
            customerType: updated.customer_type,
            phone: updated.phone || "",
            email: updated.email || "",
            address: updated.address || "",
            city: updated.city || "",
            country: updated.country || "",
            isWalkIn: Boolean(updated.is_walk_in),
            status: updated.status,
            isActive: updated.status === "Active",
            orderCount: orderCount || 0,
            storeId: updated.store_id,
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
        };

        return Response.json(
            {
                success: true,
                message: "Customer updated successfully.",
                data: {
                    customer: formatted,
                },
                customer: formatted,
            },
            { status: 200 }
        );
    } catch {
        return Response.json(
            { success: false, message: "Internal server error while updating customer." },
            { status: 500 }
        );
    }
}

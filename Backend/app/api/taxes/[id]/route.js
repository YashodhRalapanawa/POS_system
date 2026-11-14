import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../../lib/responses/index.js";
import { normalizeTaxRate } from "../../../../lib/tax/taxCalculator.js";
import { formatTaxRecord } from "../route.js";

export const dynamic = "force-dynamic";

/**
 * GET /api/taxes/[id]
 * Retrieves a single tax configuration by ID (or 'default' for the store's default tax).
 */
export async function GET(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "taxes.view",
            "taxes.manage",
            "pos.use",
            "invoices.view",
            "settings.view",
            "settings.manage",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const { id: taxId } = await params;
        if (!taxId) {
            return errorResponse("Tax ID is required.", 400);
        }

        const admin = getSupabaseAdmin();
        const storeId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";

        if (taxId === "default" || taxId.startsWith("default-")) {
            const targetStoreId = taxId.startsWith("default-") ? taxId.replace("default-", "") : storeId;
            const { data: settings } = await admin
                .from("store_settings")
                .select("store_id, default_tax_rate, prices_include_tax, updated_at")
                .eq("store_id", targetStoreId)
                .maybeSingle();

            if (!settings) {
                return errorResponse("Tax configuration not found.", 404);
            }

            return successResponse({
                tax: formatTaxRecord({
                    id: `default-${settings.store_id}`,
                    store_id: settings.store_id,
                    code: "TAX-STD",
                    name: "Standard Tax",
                    description: "Default store tax rate",
                    rate: settings.default_tax_rate,
                    is_inclusive: settings.prices_include_tax,
                    is_default: true,
                    status: "Active",
                    updated_at: settings.updated_at,
                }),
            });
        }

        const { data: tax, error } = await admin
            .from("taxes")
            .select("*")
            .eq("id", taxId)
            .maybeSingle();

        if (error || !tax) {
            return errorResponse("Tax configuration not found.", 404);
        }

        if (storeId && tax.store_id !== storeId && !isAdmin) {
            return errorResponse("You do not have access to this store's tax configuration.", 403);
        }

        return successResponse({ tax: formatTaxRecord(tax) }, "Tax configuration retrieved");
    } catch (err) {
        return errorResponse("An unexpected error occurred while retrieving the tax configuration.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

/**
 * Shared handler for PUT and PATCH /api/taxes/[id]
 * Updates an existing tax configuration or the store's default tax configuration.
 */
async function handleUpdateTax(request, { params }) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "taxes.manage",
            "settings.manage",
            "settings.update",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const { id: taxId } = await params;
        if (!taxId) {
            return errorResponse("Tax ID is required.", 400);
        }

        let body;
        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON request payload.", 400);
        }

        const admin = getSupabaseAdmin();
        const authStoreId = auth.user.storeId || auth.user.store_id;
        const isAdmin = auth.user.roleCode === "ADMIN" || auth.user.roleName === "Admin";

        // Validate rate if provided
        if (body.rate !== undefined || body.taxRate !== undefined || body.defaultTaxRate !== undefined) {
            const rawRate = Number(body.rate ?? body.taxRate ?? body.defaultTaxRate);
            if (!Number.isFinite(rawRate) || rawRate < 0 || rawRate > 100) {
                return errorResponse("Tax rate must be a valid number between 0 and 100.", 400);
            }
        }

        // Case 1: Updating store default tax directly via id="default" or virtual "default-<storeId>"
        if (taxId === "default" || taxId.startsWith("default-")) {
            const targetStoreId = taxId.startsWith("default-")
                ? taxId.replace("default-", "")
                : body.storeId || authStoreId;

            if (authStoreId && targetStoreId !== authStoreId && !isAdmin) {
                return errorResponse("You do not have access to update this store's tax settings.", 403);
            }

            const updates = {
                updated_by: auth.user.id,
                updated_at: new Date().toISOString(),
            };

            if (body.rate !== undefined || body.taxRate !== undefined || body.defaultTaxRate !== undefined) {
                updates.default_tax_rate = normalizeTaxRate(body.rate ?? body.taxRate ?? body.defaultTaxRate);
            }
            if (body.isInclusive !== undefined || body.is_inclusive !== undefined || body.pricesIncludeTax !== undefined) {
                updates.prices_include_tax = Boolean(body.isInclusive ?? body.is_inclusive ?? body.pricesIncludeTax);
            }
            if (body.showTaxBreakdown !== undefined || body.show_tax_breakdown !== undefined) {
                updates.show_tax_breakdown = Boolean(body.showTaxBreakdown ?? body.show_tax_breakdown);
            }

            const { data: updatedSettings, error: settingsErr } = await admin
                .from("store_settings")
                .update(updates)
                .eq("store_id", targetStoreId)
                .select("store_id, default_tax_rate, prices_include_tax, show_tax_breakdown, updated_at")
                .single();

            if (settingsErr) {
                return errorResponse(`Failed to update default tax settings: ${settingsErr.message}`, 500);
            }

            // Also sync default row in public.taxes if table exists
            await admin
                .from("taxes")
                .update({
                    ...(updates.default_tax_rate !== undefined ? { rate: updates.default_tax_rate } : {}),
                    ...(updates.prices_include_tax !== undefined ? { is_inclusive: updates.prices_include_tax } : {}),
                    updated_by: auth.user.id,
                    updated_at: updates.updated_at,
                })
                .eq("store_id", targetStoreId)
                .eq("is_default", true);

            return successResponse(
                {
                    tax: formatTaxRecord({
                        id: `default-${updatedSettings.store_id}`,
                        store_id: updatedSettings.store_id,
                        code: "TAX-STD",
                        name: body.name || "Standard Tax",
                        description: body.description || "Default store tax rate",
                        rate: updatedSettings.default_tax_rate,
                        is_inclusive: updatedSettings.prices_include_tax,
                        is_default: true,
                        status: "Active",
                        updated_at: updatedSettings.updated_at,
                    }),
                },
                "Default tax configuration updated successfully"
            );
        }

        // Case 2: Updating a specific row in public.taxes
        const { data: existing, error: fetchErr } = await admin
            .from("taxes")
            .select("*")
            .eq("id", taxId)
            .maybeSingle();

        if (fetchErr || !existing) {
            return errorResponse("Tax configuration not found.", 404);
        }

        if (authStoreId && existing.store_id !== authStoreId && !isAdmin) {
            return errorResponse("You do not have access to update this store's tax configuration.", 403);
        }

        const nextRate =
            body.rate !== undefined || body.taxRate !== undefined || body.defaultTaxRate !== undefined
                ? normalizeTaxRate(body.rate ?? body.taxRate ?? body.defaultTaxRate)
                : Number(existing.rate);

        const nextInclusive =
            body.isInclusive !== undefined || body.is_inclusive !== undefined || body.pricesIncludeTax !== undefined
                ? Boolean(body.isInclusive ?? body.is_inclusive ?? body.pricesIncludeTax)
                : Boolean(existing.is_inclusive);

        const nextDefault =
            body.isDefault !== undefined || body.is_default !== undefined
                ? Boolean(body.isDefault ?? body.is_default)
                : Boolean(existing.is_default);

        let nextStatus = existing.status;
        if (body.status !== undefined) {
            nextStatus = body.status === "Inactive" ? "Inactive" : "Active";
        } else if (body.isActive !== undefined) {
            nextStatus = body.isActive ? "Active" : "Inactive";
        }

        const nextName = body.name !== undefined ? String(body.name).trim() : existing.name;
        if (!nextName) {
            return errorResponse("Tax name cannot be empty.", 400);
        }

        const nextCode = body.code !== undefined ? String(body.code).trim().toUpperCase() : existing.code;
        const nextDesc = body.description !== undefined ? String(body.description).trim() : existing.description;
        const nextEffFrom = body.effectiveFrom || body.effective_from || existing.effective_from;
        const nextEffTo =
            body.effectiveTo !== undefined || body.effective_to !== undefined
                ? body.effectiveTo || body.effective_to || null
                : existing.effective_to;

        // If setting as default active tax, unset other defaults for this store and sync store_settings
        if (nextDefault && nextStatus === "Active") {
            await admin
                .from("taxes")
                .update({ is_default: false, updated_by: auth.user.id })
                .eq("store_id", existing.store_id)
                .neq("id", taxId);

            await admin
                .from("store_settings")
                .update({
                    default_tax_rate: nextRate,
                    prices_include_tax: nextInclusive,
                    updated_by: auth.user.id,
                    updated_at: new Date().toISOString(),
                })
                .eq("store_id", existing.store_id);
        }

        const { data: updated, error: updateErr } = await admin
            .from("taxes")
            .update({
                code: nextCode,
                name: nextName,
                description: nextDesc,
                rate: nextRate,
                is_inclusive: nextInclusive,
                is_default: nextDefault,
                effective_from: nextEffFrom,
                effective_to: nextEffTo,
                status: nextStatus,
                updated_by: auth.user.id,
                updated_at: new Date().toISOString(),
            })
            .eq("id", taxId)
            .select("*")
            .single();

        if (updateErr) {
            if (updateErr.code === "23505") {
                return errorResponse(`A tax configuration with code "${nextCode}" already exists.`, 409);
            }
            return errorResponse(`Failed to update tax configuration: ${updateErr.message}`, 500);
        }

        return successResponse(
            { tax: formatTaxRecord(updated) },
            "Tax configuration updated successfully"
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while updating the tax configuration.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

export async function PUT(request, context) {
    return handleUpdateTax(request, context);
}

export async function PATCH(request, context) {
    return handleUpdateTax(request, context);
}


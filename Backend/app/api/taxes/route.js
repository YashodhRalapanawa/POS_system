import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../lib/auth/authorize.js";
import { successResponse, errorResponse } from "../../../lib/responses/index.js";
import {
    getStoreTaxConfig,
    normalizeTaxRate,
    calculateDocumentFinancials,
} from "../../../lib/tax/taxCalculator.js";

export const dynamic = "force-dynamic";

export function formatTaxRecord(t) {
    return {
        id: t.id,
        storeId: t.store_id,
        code: t.code || "TAX-STD",
        name: t.name || "Standard Tax",
        description: t.description || "",
        rate: Number(t.rate ?? 0),
        isInclusive: Boolean(t.is_inclusive),
        pricesIncludeTax: Boolean(t.is_inclusive),
        isDefault: Boolean(t.is_default),
        effectiveFrom: t.effective_from || null,
        effectiveTo: t.effective_to || null,
        status: t.status || "Active",
        isActive: (t.status || "Active") === "Active",
        createdAt: t.created_at || null,
        updatedAt: t.updated_at || null,
    };
}

/**
 * Resolves the target store ID for the current request.
 */
async function resolveStoreId(admin, authUser, requestedStoreId) {
    const isAdmin = authUser.roleCode === "ADMIN" || authUser.roleName === "Admin";
    let storeId = authUser.storeId || authUser.store_id || null;

    if (isAdmin && requestedStoreId && requestedStoreId !== "All" && requestedStoreId !== "All Stores") {
        storeId = requestedStoreId;
    }

    if (!storeId) {
        const { data: firstStore } = await admin
            .from("stores")
            .select("id")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();
        storeId = firstStore?.id || null;
    }

    return storeId;
}

/**
 * GET /api/taxes
 * Retrieves active/all tax configurations and store tax settings.
 * Also supports optional preview calculation if query params `amount` and `rate` are provided.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, [
            "taxes.view",
            "taxes.manage",
            "pos.use",
            "invoices.view",
            "orders.view",
            "settings.view",
            "settings.manage",
        ]);

        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const admin = getSupabaseAdmin();
        const url = new URL(request.url);
        const requestedStoreId = (url.searchParams.get("storeId") || "").trim();
        const statusFilter = (url.searchParams.get("status") || "").trim();

        const storeId = await resolveStoreId(admin, auth.user, requestedStoreId);
        if (!storeId) {
            return errorResponse("Store not found.", 404);
        }

        const taxConfig = await getStoreTaxConfig(admin, storeId);

        let formattedTaxes = (taxConfig.taxes || []).map(formatTaxRecord);
        if (statusFilter && statusFilter !== "All" && statusFilter !== "All Status") {
            formattedTaxes = formattedTaxes.filter(
                (t) => t.status.toLowerCase() === statusFilter.toLowerCase()
            );
        }

        const defaultTax = formattedTaxes.find((t) => t.isDefault && t.isActive) || formattedTaxes[0] || null;

        return successResponse(
            {
                storeId,
                defaultTaxRate: taxConfig.defaultTaxRate,
                pricesIncludeTax: taxConfig.pricesIncludeTax,
                showTaxBreakdown: taxConfig.showTaxBreakdown,
                defaultTax,
                taxes: formattedTaxes,
            },
            "Tax configurations retrieved successfully"
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while retrieving tax configurations.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}

/**
 * POST /api/taxes
 * Creates a new tax configuration or updates the store's default tax configuration.
 * Also supports `action: "calculate"` for dry-run backend tax calculation checks.
 */
export async function POST(request) {
    try {
        let body;
        try {
            body = await request.json();
        } catch {
            return errorResponse("Invalid JSON request payload.", 400);
        }

        // If caller requests a dry-run tax calculation via the central service
        if (body.action === "calculate" && Array.isArray(body.items)) {
            const auth = await requireAuthAndPermission(request, [
                "taxes.view",
                "taxes.manage",
                "pos.use",
                "invoices.view",
                "orders.view",
            ]);
            if (!auth.authorized) return auth.response;

            const admin = getSupabaseAdmin();
            const storeId = await resolveStoreId(admin, auth.user, body.storeId);
            const taxConfig = storeId ? await getStoreTaxConfig(admin, storeId) : { defaultTaxRate: 15, pricesIncludeTax: false };

            const result = calculateDocumentFinancials({
                items: body.items,
                discountType: body.discountType || null,
                discountValue: body.discountValue || 0,
                defaultTaxRate: body.defaultTaxRate ?? taxConfig.defaultTaxRate,
                pricesIncludeTax: body.pricesIncludeTax ?? taxConfig.pricesIncludeTax,
            });

            return successResponse(result, "Tax calculation completed");
        }

        // Creating/configuring a tax rule requires management permissions
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

        const admin = getSupabaseAdmin();
        const storeId = await resolveStoreId(admin, auth.user, body.storeId || body.store_id);
        if (!storeId) {
            return errorResponse("Store ID is required.", 400);
        }

        const name = String(body.name || "").trim();
        if (!name) {
            return errorResponse("Tax name is required.", 400);
        }

        const rawRate = Number(body.rate ?? body.taxRate ?? body.defaultTaxRate);
        if (!Number.isFinite(rawRate) || rawRate < 0 || rawRate > 100) {
            return errorResponse("Tax rate must be a valid number between 0 and 100.", 400);
        }

        const rate = normalizeTaxRate(rawRate);
        const code = String(body.code || `TAX-${name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || Date.now().toString().slice(-4)}`).trim().toUpperCase();
        const description = String(body.description || "").trim();
        const isInclusive = Boolean(body.isInclusive ?? body.is_inclusive ?? body.pricesIncludeTax ?? false);
        const isDefault = Boolean(body.isDefault ?? body.is_default ?? false);
        const status = body.status === "Inactive" || body.isActive === false ? "Inactive" : "Active";
        const effectiveFrom = body.effectiveFrom || body.effective_from || new Date().toISOString().slice(0, 10);
        const effectiveTo = body.effectiveTo || body.effective_to || null;

        // If this tax is marked as default & active, sync store_settings and unset previous default
        if (isDefault && status === "Active") {
            await admin
                .from("store_settings")
                .update({
                    default_tax_rate: rate,
                    prices_include_tax: isInclusive,
                    updated_by: auth.user.id,
                    updated_at: new Date().toISOString(),
                })
                .eq("store_id", storeId);

            await admin
                .from("taxes")
                .update({ is_default: false, updated_by: auth.user.id })
                .eq("store_id", storeId)
                .eq("is_default", true);
        }

        const { data: inserted, error: insertErr } = await admin
            .from("taxes")
            .insert({
                store_id: storeId,
                code,
                name,
                description,
                rate,
                is_inclusive: isInclusive,
                is_default: isDefault,
                effective_from: effectiveFrom,
                effective_to: effectiveTo,
                status,
                created_by: auth.user.id,
                updated_by: auth.user.id,
            })
            .select("*")
            .single();

        if (insertErr) {
            if (insertErr.code === "23505") {
                return errorResponse(`A tax configuration with code "${code}" already exists in this store.`, 409);
            }
            // Fallback if public.taxes migration has not been run yet in Supabase: update store_settings directly
            if (insertErr.message?.includes("relation") && insertErr.message?.includes("taxes")) {
                const { error: settingsErr } = await admin
                    .from("store_settings")
                    .update({
                        default_tax_rate: rate,
                        prices_include_tax: isInclusive,
                        updated_by: auth.user.id,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("store_id", storeId);

                if (settingsErr) {
                    return errorResponse(`Failed to save tax configuration: ${settingsErr.message}`, 500);
                }

                const virtualTax = formatTaxRecord({
                    id: `default-${storeId}`,
                    store_id: storeId,
                    code,
                    name,
                    description,
                    rate,
                    is_inclusive: isInclusive,
                    is_default: true,
                    effective_from: effectiveFrom,
                    effective_to: effectiveTo,
                    status: "Active",
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });

                return successResponse({ tax: virtualTax }, "Store default tax configuration saved", 201);
            }

            return errorResponse(`Failed to create tax configuration: ${insertErr.message}`, 500);
        }

        return successResponse(
            { tax: formatTaxRecord(inserted) },
            "Tax configuration created successfully",
            201
        );
    } catch (err) {
        return errorResponse("An unexpected error occurred while creating the tax configuration.", 500, {
            detail: process.env.NODE_ENV === "development" ? err.message : undefined,
        });
    }
}


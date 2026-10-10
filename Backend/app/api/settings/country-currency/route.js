import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../../lib/supabase/admin.js";
import { requireAuthAndPermission } from "../../../../lib/auth/authorize.js";
import {
    isValidCountryCode,
    isValidCurrencyCode,
    isValidCountryCurrencyCombination,
    resolveCurrencyForCountry,
    getCountryByCode,
} from "../../../../lib/currency/currencies.js";

export const dynamic = "force-dynamic";

function errorResponse(message, status = 400) {
    return Response.json({ success: false, message }, { status });
}

/**
 * Resolves the target store ID for the current request.
 * Prioritizes the authenticated user's store, with admin override or first store fallback.
 */
async function resolveTargetStore(admin, authUser, requestedStoreId) {
    const isAdmin = authUser.roleCode === "ADMIN" || authUser.roleName === "Admin";
    let targetStoreId = authUser.storeId || authUser.store_id || null;

    if (isAdmin && requestedStoreId) {
        targetStoreId = requestedStoreId;
    }

    if (!targetStoreId) {
        const { data: storeRow } = await admin
            .from("stores")
            .select("id")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

        if (storeRow?.id) {
            targetStoreId = storeRow.id;
        }
    }

    return targetStoreId;
}

/**
 * GET /api/settings/country-currency
 * Retrieves authoritative country and currency settings for the authenticated store scope.
 */
export async function GET(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["settings.view", "settings.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const admin = getSupabaseAdmin();
        const url = new URL(request.url);
        const requestedStoreId = url.searchParams.get("storeId");

        const targetStoreId = await resolveTargetStore(admin, auth.user, requestedStoreId);
        if (!targetStoreId) {
            return errorResponse("No active store found to retrieve settings.", 404);
        }

        // Query store_settings
        const { data: storeSetting, error: settingErr } = await admin
            .from("store_settings")
            .select("store_id, country_code, currency_code, currency, updated_at, updated_by")
            .eq("store_id", targetStoreId)
            .maybeSingle();

        if (settingErr) {
            return errorResponse("Failed to load store settings.", 500);
        }

        // Determine configured country and currency codes
        let countryCode = storeSetting?.country_code || "LK";
        let currencyCode = storeSetting?.currency_code || storeSetting?.currency || "LKR";

        // Fallback to store table if store_settings didn't have country_code
        if (!storeSetting?.country_code) {
            const { data: storeRow } = await admin
                .from("stores")
                .select("country_code, currency_code")
                .eq("id", targetStoreId)
                .maybeSingle();

            if (storeRow?.country_code) {
                countryCode = storeRow.country_code;
            }
            if (storeRow?.currency_code) {
                currencyCode = storeRow.currency_code;
            }
        }

        // Resolve authoritative metadata
        const metadata = resolveCurrencyForCountry(countryCode);

        // If the store had a specific valid currency code different from country's default
        if (isValidCurrencyCode(currencyCode) && currencyCode !== metadata.currencyCode) {
            metadata.currencyCode = currencyCode;
        }

        const payload = {
            countryCode: metadata.countryCode,
            countryName: metadata.countryName,
            currencyCode: metadata.currencyCode,
            currencyName: metadata.currencyName,
            currencySymbol: metadata.currencySymbol,
            storeId: targetStoreId,
            updatedAt: storeSetting?.updated_at || null,
            updatedBy: storeSetting?.updated_by || null,
        };

        return Response.json({
            success: true,
            ...payload,
            data: payload,
        });
    } catch (err) {
        console.error("GET /api/settings/country-currency error:", err);
        return errorResponse("An unexpected error occurred while loading settings.", 500);
    }
}

/**
 * PATCH /api/settings/country-currency
 * Updates country and currency configuration for the authenticated store scope.
 */
export async function PATCH(request) {
    try {
        const auth = await requireAuthAndPermission(request, ["settings.update", "settings.manage"]);
        if (!auth.authorized) {
            return auth.response;
        }

        if (!isSupabaseAdminConfigured()) {
            return errorResponse("Database configuration is missing.", 503);
        }

        const admin = getSupabaseAdmin();
        const body = await request.json().catch(() => ({}));

        const { countryCode: rawCountryCode, currencyCode: rawCurrencyCode, storeId: requestedStoreId } = body;

        if (!rawCountryCode || typeof rawCountryCode !== "string") {
            return errorResponse("Valid ISO 3166-1 country code is required.", 400);
        }

        const countryCode = rawCountryCode.trim().toUpperCase();
        if (!isValidCountryCode(countryCode)) {
            return errorResponse(`Invalid country code "${rawCountryCode}". Must be a valid ISO 3166-1 alpha-2 code.`, 400);
        }

        // Determine currency code
        let currencyCode = rawCurrencyCode ? String(rawCurrencyCode).trim().toUpperCase() : null;
        if (!currencyCode) {
            const countryInfo = getCountryByCode(countryCode);
            currencyCode = countryInfo ? countryInfo.currencyCode : "USD";
        }

        if (!isValidCurrencyCode(currencyCode)) {
            return errorResponse(`Invalid currency code "${rawCurrencyCode}". Must be a valid ISO 4217 code.`, 400);
        }

        // Validate country & currency combination
        if (!isValidCountryCurrencyCombination(countryCode, currencyCode)) {
            return errorResponse(
                `Currency "${currencyCode}" does not match the designated national currency for country "${countryCode}".`,
                400
            );
        }

        const targetStoreId = await resolveTargetStore(admin, auth.user, requestedStoreId);
        if (!targetStoreId) {
            return errorResponse("No active store found to update settings.", 404);
        }

        const now = new Date().toISOString();
        const updatedBy = auth.user.id;

        // Upsert store_settings
        const { error: upsertErr } = await admin
            .from("store_settings")
            .upsert(
                {
                    store_id: targetStoreId,
                    country_code: countryCode,
                    currency_code: currencyCode,
                    currency: currencyCode,
                    updated_by: updatedBy,
                    updated_at: now,
                },
                { onConflict: "store_id" }
            );

        if (upsertErr) {
            console.error("Failed to update store_settings:", upsertErr);
            return errorResponse("Failed to update store settings.", 500);
        }

        // Also sync to store record
        await admin
            .from("stores")
            .update({
                country_code: countryCode,
                currency_code: currencyCode,
                updated_at: now,
            })
            .eq("id", targetStoreId);

        const metadata = resolveCurrencyForCountry(countryCode);

        const payload = {
            countryCode: metadata.countryCode,
            countryName: metadata.countryName,
            currencyCode: metadata.currencyCode,
            currencyName: metadata.currencyName,
            currencySymbol: metadata.currencySymbol,
            storeId: targetStoreId,
            updatedAt: now,
            updatedBy,
        };

        return Response.json({
            success: true,
            message: "Country and currency settings updated successfully.",
            ...payload,
            data: payload,
        });
    } catch (err) {
        console.error("PATCH /api/settings/country-currency error:", err);
        return errorResponse("An unexpected error occurred while updating settings.", 500);
    }
}

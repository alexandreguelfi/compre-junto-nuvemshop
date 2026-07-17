export const STOREFRONT_RESULT_CODES = [
  "storefront_script_loaded",
  "storefront_context_unavailable",
  "store_id_unavailable",
  "product_id_unavailable",
  "store_not_connected",
  "store_ambiguous",
  "commercial_access_denied",
  "offer_found",
  "offer_not_found",
  "offer_inactive",
  "trigger_product_mismatch",
  "suggested_product_lookup_failed",
  "widget_rendered",
  "widget_already_rendered",
  "offer_request_deduplicated",
  "legacy_suppressed_nubesdk",
  "cart_add_started",
  "cart_add_success",
  "cart_add_failed",
] as const;

export type StorefrontResultCode = (typeof STOREFRONT_RESULT_CODES)[number];
export type StorefrontTechnology = "legacy" | "nubesdk" | "unknown";

export function readStorefrontTechnology(value: string | null | undefined): StorefrontTechnology {
  return value === "legacy" || value === "nubesdk" ? value : "unknown";
}

export function isStorefrontResultCode(value: unknown): value is StorefrontResultCode {
  return typeof value === "string" && (STOREFRONT_RESULT_CODES as readonly string[]).includes(value);
}

export function isSafeNuvemshopId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{1,30}$/.test(value);
}

export function isStorefrontDiagnosticModeRequested(value: string | null | undefined) {
  return value === "1" || value === "true";
}

export function areStorefrontDiagnosticsEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.STOREFRONT_DIAGNOSTICS_ENABLED === "true";
}

export type StorefrontEventPayload = {
  code: StorefrontResultCode;
  productId: string;
  storeId: string;
  technology: Exclude<StorefrontTechnology, "unknown">;
};

export function parseStorefrontEventPayload(value: unknown): StorefrontEventPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const technology = readStorefrontTechnology(typeof body.technology === "string" ? body.technology : null);
  const productId = typeof body.productId === "string" ? body.productId : null;
  const storeId = typeof body.storeId === "string" ? body.storeId : null;

  if (!isStorefrontResultCode(body.code) || !isSafeNuvemshopId(productId) || !isSafeNuvemshopId(storeId) || technology === "unknown") {
    return null;
  }

  return { code: body.code, productId, storeId, technology };
}

export const STOREFRONT_REQUEST_STATE_KEY = "__compreJuntoStorefrontRequestsV2";

export type StorefrontTechnology = "legacy" | "nubesdk";

export function buildStorefrontOfferRequestKey({
  diagnosticMode,
  productId,
  storeId,
  technology,
}: {
  diagnosticMode: boolean;
  productId: string;
  storeId: string;
  technology: StorefrontTechnology;
}) {
  return `${storeId}:${productId}:${technology}:${diagnosticMode ? "diagnostic" : "standard"}`;
}

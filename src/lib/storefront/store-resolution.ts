export type StoreResolutionReason = "ok" | "store_ambiguous" | "store_not_connected";
export type StoreResolution<T> =
  | { reason: "ok"; store: T }
  | { reason: "store_ambiguous" | "store_not_connected"; store: null };

export function resolveStoreCandidate<T extends { providerStoreId: string }>(
  stores: T[],
  requestedProviderStoreId: string | null,
): StoreResolution<T> {
  if (requestedProviderStoreId) {
    const matches = stores.filter((store) => store.providerStoreId === requestedProviderStoreId);
    return matches.length === 1
      ? { reason: "ok", store: matches[0] }
      : { reason: "store_not_connected", store: null };
  }

  if (stores.length === 1) return { reason: "ok", store: stores[0] };
  return { reason: stores.length ? "store_ambiguous" : "store_not_connected", store: null };
}

export type OfferAvailabilityCode = "offer_found" | "offer_inactive" | "offer_not_found" | "trigger_product_mismatch";

export function classifyMatchingOffers<T extends { isActive: boolean }>(matchingOffers: T[], activeStoreOfferCount: number) {
  const activeOffer = matchingOffers.find((offer) => offer.isActive) ?? null;
  if (activeOffer) return { code: "offer_found" as const, offer: activeOffer };
  if (matchingOffers.length) return { code: "offer_inactive" as const, offer: null };
  return {
    code: activeStoreOfferCount ? ("trigger_product_mismatch" as const) : ("offer_not_found" as const),
    offer: null,
  };
}

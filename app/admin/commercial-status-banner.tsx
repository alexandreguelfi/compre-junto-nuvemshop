import type { StoreCommercialAccess } from "@/src/lib/billing/commercial-status";

type CommercialStatusBannerProps = {
  access: StoreCommercialAccess;
};

export function CommercialStatusBanner({ access }: CommercialStatusBannerProps) {
  const isBlocked = !access.canCreateOffer;

  return (
    <section
      className={
        isBlocked
          ? "rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950"
          : "rounded-md border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950"
      }
    >
      <p className="text-sm font-semibold">
        {access.planName} — {access.planPriceLabel}
      </p>
      <p className="mt-1 text-sm leading-6">{access.message}</p>
    </section>
  );
}

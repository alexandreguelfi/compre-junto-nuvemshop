import Link from "next/link";

import type { StoreCommercialAccess } from "@/src/lib/billing/commercial-status";

type CommercialStatusBannerProps = {
  access: StoreCommercialAccess;
};

export function CommercialStatusBanner({ access }: CommercialStatusBannerProps) {
  const isBlocked = access.enforcementEnabled && !access.canCreateOffer;

  return (
    <section
      className={
        isBlocked
          ? "rounded-md border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950"
          : "rounded-md border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950"
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">
            {access.planName} - {access.planPriceLabel}
          </p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide">{access.modeLabel}</p>
        </div>
        <Link
          href="/admin/billing"
          className="inline-flex h-8 items-center justify-center rounded-md border border-current px-3 text-xs font-semibold transition hover:bg-white/60"
        >
          Ver billing
        </Link>
      </div>
      <p className="mt-2 text-sm leading-6">{access.message}</p>
    </section>
  );
}

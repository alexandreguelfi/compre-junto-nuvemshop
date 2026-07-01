import Link from "next/link";

import { CommercialStatusBanner } from "@/app/admin/commercial-status-banner";
import { OfferStatusAction } from "@/app/admin/ofertas/offer-status-action";
import { getCommercialStatus } from "@/src/lib/billing/commercial-status";
import { prisma } from "@/src/lib/prisma";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OffersPageProps = {
  searchParams?: Promise<{
    created?: string | string[] | undefined;
    updated?: string | string[] | undefined;
  }>;
};

async function getOffers(storeId: string) {
  return prisma.crossSellOffer.findMany({
    where: {
      storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      suggestedProductId: true,
      suggestedProductName: true,
      isActive: true,
      createdAt: true,
      _count: {
        select: {
          triggers: true,
        },
      },
      triggers: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          triggerProductId: true,
          triggerProductName: true,
        },
        take: 3,
      },
    },
  });
}

function hasCreatedFeedback(created: string | string[] | undefined) {
  return created === "1" || (Array.isArray(created) && created.includes("1"));
}

function hasUpdatedFeedback(updated: string | string[] | undefined) {
  return updated === "1" || (Array.isArray(updated) && updated.includes("1"));
}

export default async function OffersPage({ searchParams }: OffersPageProps) {
  const params = searchParams ? await searchParams : {};
  const showCreatedFeedback = hasCreatedFeedback(params.created);
  const showUpdatedFeedback = hasUpdatedFeedback(params.updated);
  const store = await getConnectedStore();
  const commercialAccess = store ? await getCommercialStatus(store.id) : null;
  const offers = store ? await getOffers(store.id) : [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl bg-zinc-50 px-6 py-10 text-zinc-950">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Compre Junto</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Ofertas Compre Junto</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Crie sugestoes automaticas para aumentar o ticket medio da loja.
          </p>
        </div>
        <Link
          href="/admin/ofertas/nova"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Criar oferta
        </Link>
      </header>

      {commercialAccess ? (
        <div className="mt-6">
          <CommercialStatusBanner access={commercialAccess} />
        </div>
      ) : null}

      {showCreatedFeedback ? (
        <section
          role="status"
          className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          Oferta criada com sucesso.
        </section>
      ) : null}

      {showUpdatedFeedback ? (
        <section
          role="status"
          className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          Oferta atualizada com sucesso.
        </section>
      ) : null}

      {!store ? (
        <section className="mt-10 rounded-md border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Loja nao conectada</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Conecte uma loja pela instalacao da Nuvemshop antes de criar ofertas.
          </p>
        </section>
      ) : offers.length === 0 ? (
        <section className="mt-10 rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold">Nenhuma oferta criada</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Escolha um produto para sugerir e informe onde essa sugestao deve aparecer.
          </p>
          <Link
            href="/admin/ofertas/nova"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Criar oferta
          </Link>
        </section>
      ) : (
        <section className="mt-8 overflow-hidden rounded-md border border-zinc-200 bg-white">
          <div className="grid gap-4 border-b border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-500 md:grid-cols-[1fr_1fr_120px_190px]">
            <span>Produto sugerido</span>
            <span>Aparece em</span>
            <span>Status</span>
            <span>Acoes</span>
          </div>
          <ul className="divide-y divide-zinc-200">
            {offers.map((offer) => (
              <li key={offer.id} className="grid gap-4 px-4 py-4 text-sm md:grid-cols-[1fr_1fr_120px_190px]">
                <div>
                  <p className="font-medium text-zinc-900">{offer.suggestedProductName}</p>
                  <p className="mt-1 text-zinc-500">ID {offer.suggestedProductId}</p>
                </div>
                <div>
                  <p className="font-medium text-zinc-900">
                    {offer._count.triggers} {offer._count.triggers === 1 ? "produto" : "produtos"}
                  </p>
                  <div className="mt-1 grid gap-1 text-zinc-500">
                    {offer.triggers.map((trigger) => (
                      <p key={trigger.triggerProductId}>
                        {trigger.triggerProductName} - ID {trigger.triggerProductId}
                      </p>
                    ))}
                    {offer._count.triggers > offer.triggers.length ? (
                      <p>+{offer._count.triggers - offer.triggers.length} produto(s)</p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <span
                    className={
                      offer.isActive
                        ? "inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
                        : "inline-flex rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200"
                    }
                  >
                    {offer.isActive ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                  <Link
                    href={`/admin/ofertas/${offer.id}/editar`}
                    className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-3 text-xs font-medium text-white transition hover:bg-zinc-800"
                  >
                    Editar
                  </Link>
                  <OfferStatusAction offerId={offer.id} isActive={offer.isActive} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

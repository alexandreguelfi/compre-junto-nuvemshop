import Link from "next/link";

import { prisma } from "@/src/lib/prisma";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    },
  });
}

export default async function OffersPage() {
  const store = await getConnectedStore();
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
          <div className="grid grid-cols-[1fr_1fr_120px] gap-4 border-b border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-500">
            <span>Produto sugerido</span>
            <span>Aparece em</span>
            <span>Status</span>
          </div>
          <ul className="divide-y divide-zinc-200">
            {offers.map((offer) => (
              <li key={offer.id} className="grid grid-cols-[1fr_1fr_120px] gap-4 px-4 py-4 text-sm">
                <div>
                  <p className="font-medium text-zinc-900">{offer.suggestedProductName}</p>
                  <p className="mt-1 text-zinc-500">ID {offer.suggestedProductId}</p>
                </div>
                <div>
                  <p className="font-medium text-zinc-900">
                    {offer._count.triggers} {offer._count.triggers === 1 ? "produto" : "produtos"}
                  </p>
                  <p className="mt-1 text-zinc-500">Produtos onde a sugestao aparece</p>
                </div>
                <div className="text-zinc-700">{offer.isActive ? "Ativa" : "Inativa"}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

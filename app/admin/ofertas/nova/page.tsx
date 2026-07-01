import Link from "next/link";

import { CommercialStatusBanner } from "@/app/admin/commercial-status-banner";
import { ProductOfferForm } from "@/app/admin/ofertas/nova/product-offer-form";
import { getCommercialStatus } from "@/src/lib/billing/commercial-status";
import { listConnectedStoreProducts } from "@/src/lib/nuvemshop/products";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NewOfferPage() {
  const store = await getConnectedStore();
  const commercialAccess = store ? await getCommercialStatus(store.id) : null;
  const canCreateOffer = Boolean(commercialAccess?.canCreateOffer);
  const productsResult = store && canCreateOffer
    ? await listConnectedStoreProducts().then(
        (products) => ({
          products,
          productsLoadFailed: false,
        }),
        (error: unknown) => {
          console.warn("Admin new offer products preload failed.", {
            name: error instanceof Error ? error.name : "unknown",
          });

          return {
            products: [],
            productsLoadFailed: true,
          };
        },
      )
    : {
        products: [],
        productsLoadFailed: false,
      };

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl bg-zinc-50 px-6 py-10 text-zinc-950">
      <header className="border-b border-zinc-200 pb-6">
        <Link href="/admin/ofertas" className="text-sm font-medium text-zinc-500 hover:text-zinc-900">
          Voltar para ofertas
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Criar oferta Compre Junto</h1>
      </header>

      {commercialAccess ? (
        <div className="mt-8">
          <CommercialStatusBanner access={commercialAccess} />
        </div>
      ) : null}

      {!store ? (
        <section className="mt-8 rounded-md border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Loja nao conectada</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Conecte uma loja pela instalacao da Nuvemshop antes de criar ofertas.
          </p>
        </section>
      ) : !canCreateOffer ? (
        <section className="mt-8 rounded-md border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Criacao de ofertas bloqueada</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Assine o Compre Junto Pro para voltar a criar e editar ofertas. As ofertas existentes continuam
            disponiveis para consulta na listagem.
          </p>
          <Link
            href="/admin/ofertas"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100"
          >
            Ver ofertas existentes
          </Link>
        </section>
      ) : (
        <ProductOfferForm
          products={productsResult.products}
          productsLoadFailed={productsResult.productsLoadFailed}
        />
      )}
    </main>
  );
}

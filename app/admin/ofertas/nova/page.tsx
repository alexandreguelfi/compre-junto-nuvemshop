import Link from "next/link";

import { ProductOfferForm } from "@/app/admin/ofertas/nova/product-offer-form";
import { listConnectedStoreProducts } from "@/src/lib/nuvemshop/products";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NewOfferPage() {
  const store = await getConnectedStore();
  const productsResult = store
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

      {!store ? (
        <section className="mt-8 rounded-md border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Loja nao conectada</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Conecte uma loja pela instalacao da Nuvemshop antes de criar ofertas.
          </p>
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

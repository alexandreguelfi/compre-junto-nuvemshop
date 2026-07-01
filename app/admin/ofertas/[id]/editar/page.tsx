import Link from "next/link";
import { notFound } from "next/navigation";

import { CommercialStatusBanner } from "@/app/admin/commercial-status-banner";
import { ProductOfferForm, type ProductOfferInitialValues } from "@/app/admin/ofertas/nova/product-offer-form";
import { resolveStoreCommercialAccess } from "@/src/lib/billing/commercial-status";
import { listConnectedStoreProducts } from "@/src/lib/nuvemshop/products";
import { prisma } from "@/src/lib/prisma";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EditOfferPageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function getOfferInitialValues(storeId: string, offerId: string): Promise<ProductOfferInitialValues | null> {
  const offer = await prisma.crossSellOffer.findFirst({
    where: {
      id: offerId,
      storeId,
    },
    select: {
      isActive: true,
      suggestedProductId: true,
      suggestedProductName: true,
      triggers: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          triggerProductId: true,
          triggerProductName: true,
        },
        take: 1,
      },
    },
  });

  if (!offer) {
    return null;
  }

  const trigger = offer.triggers[0];

  return {
    isActive: offer.isActive,
    suggestedProductId: offer.suggestedProductId,
    suggestedProductName: offer.suggestedProductName,
    triggerProductId: trigger?.triggerProductId ?? "",
    triggerProductName: trigger?.triggerProductName ?? "",
  };
}

export default async function EditOfferPage({ params }: EditOfferPageProps) {
  const { id } = await params;
  const store = await getConnectedStore();
  const commercialAccess = store ? resolveStoreCommercialAccess(store) : null;
  const canEditOffer = Boolean(commercialAccess?.canCreateOffer);
  const initialValues = store ? await getOfferInitialValues(store.id, id) : null;

  if (store && !initialValues) {
    notFound();
  }

  const productsResult = store && canEditOffer
    ? await listConnectedStoreProducts().then(
        (products) => ({
          products,
          productsLoadFailed: false,
        }),
        (error: unknown) => {
          console.warn("Admin edit offer products preload failed.", {
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
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Editar oferta Compre Junto</h1>
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
            Conecte uma loja pela instalacao da Nuvemshop antes de editar ofertas.
          </p>
        </section>
      ) : !canEditOffer ? (
        <section className="mt-8 rounded-md border border-zinc-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Edicao de ofertas bloqueada</h2>
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
      ) : initialValues ? (
        <ProductOfferForm
          action={`/api/admin/ofertas/${id}`}
          initialValues={initialValues}
          products={productsResult.products}
          productsLoadFailed={productsResult.productsLoadFailed}
          submitLabel="Salvar alteracoes"
          submitMethod="PATCH"
          submittingLabel="Salvando alteracoes..."
          successRedirect="/admin/ofertas?updated=1"
        />
      ) : null}
    </main>
  );
}

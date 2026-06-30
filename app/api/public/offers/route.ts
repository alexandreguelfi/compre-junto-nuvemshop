import { type NextRequest, NextResponse } from "next/server";

import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const connectedStoreWhere = {
  AND: [
    {
      accessTokenCiphertext: {
        not: null,
      },
    },
    {
      accessTokenCiphertext: {
        not: "",
      },
    },
  ],
};

type PublicStoreLookup =
  | {
      reason: "ok";
      storeId: string;
    }
  | {
      reason: "no_connected_store" | "store_id_required";
      storeId: null;
    };

function readQueryValue(request: NextRequest, key: string): string | null {
  return request.nextUrl.searchParams.get(key)?.trim() || null;
}

function offerNotFound() {
  return NextResponse.json({ offer: null });
}

async function findPublicStore(providerStoreId: string | null): Promise<PublicStoreLookup> {
  if (providerStoreId) {
    const store = await prisma.store.findFirst({
      where: {
        ...connectedStoreWhere,
        nuvemshopStoreId: providerStoreId,
      },
      select: {
        id: true,
      },
    });

    return store ? { reason: "ok", storeId: store.id } : { reason: "no_connected_store", storeId: null };
  }

  const stores = await prisma.store.findMany({
    where: connectedStoreWhere,
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
    },
    take: 2,
  });

  if (stores.length === 1) {
    return { reason: "ok", storeId: stores[0].id };
  }

  return {
    reason: stores.length === 0 ? "no_connected_store" : "store_id_required",
    storeId: null,
  };
}

export async function GET(request: NextRequest) {
  const productId = readQueryValue(request, "productId");

  if (!productId) {
    return NextResponse.json({ error: "productId is required." }, { status: 400 });
  }

  try {
    const store = await findPublicStore(readQueryValue(request, "storeId"));

    if (store.reason === "store_id_required") {
      return NextResponse.json({ error: "storeId is required when multiple stores are connected." }, { status: 400 });
    }

    if (!store.storeId) {
      return offerNotFound();
    }

    const offer = await prisma.crossSellOffer.findFirst({
      where: {
        storeId: store.storeId,
        isActive: true,
        triggers: {
          some: {
            triggerProductId: productId,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        suggestedProductId: true,
        suggestedProductName: true,
      },
    });

    if (!offer) {
      return offerNotFound();
    }

    return NextResponse.json({
      offer: {
        principalProductId: productId,
        suggestedProduct: {
          id: offer.suggestedProductId,
          name: offer.suggestedProductName,
        },
      },
    });
  } catch (error) {
    console.warn("Public offer lookup failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });

    return NextResponse.json({ error: "Unable to load offer." }, { status: 500 });
  }
}

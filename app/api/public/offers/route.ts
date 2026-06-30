import { type NextRequest, NextResponse } from "next/server";

import { resolveStoreCommercialAccess, type CommercialStatus } from "@/src/lib/billing/commercial-status";
import { decryptAccessTokenFromStorage } from "@/src/lib/nuvemshop/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NUVEMSHOP_API_VERSION = "2025-03";
const NUVEMSHOP_API_BASE_URL = `https://api.tiendanube.com/${NUVEMSHOP_API_VERSION}`;
const USER_AGENT = "CompreJuntoNuvemshop atendimento@casasmartnest.com.br";

const publicOfferHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

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
      accessTokenCiphertext: string;
      commercialStatus: CommercialStatus;
      createdAt: Date;
      installedAt: Date;
      providerStoreId: string;
      reason: "ok";
      storeId: string;
      trialEndsAt: Date | null;
      trialStartedAt: Date | null;
    }
  | {
      reason: "no_connected_store" | "store_id_required";
      storeId: null;
    };

function readQueryValue(request: NextRequest, key: string): string | null {
  return request.nextUrl.searchParams.get(key)?.trim() || null;
}

function publicJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: publicOfferHeaders,
  });
}

function offerNotFound() {
  return publicJson({ offer: null });
}

async function findPublicStore(providerStoreId: string | null): Promise<PublicStoreLookup> {
  if (providerStoreId) {
    const store = await prisma.store.findFirst({
      where: {
        ...connectedStoreWhere,
        nuvemshopStoreId: providerStoreId,
      },
      select: {
        accessTokenCiphertext: true,
        commercialStatus: true,
        createdAt: true,
        id: true,
        installedAt: true,
        nuvemshopStoreId: true,
        trialEndsAt: true,
        trialStartedAt: true,
      },
    });

    return store && store.accessTokenCiphertext
      ? {
          accessTokenCiphertext: store.accessTokenCiphertext,
          commercialStatus: store.commercialStatus,
          createdAt: store.createdAt,
          installedAt: store.installedAt,
          providerStoreId: store.nuvemshopStoreId,
          reason: "ok",
          storeId: store.id,
          trialEndsAt: store.trialEndsAt,
          trialStartedAt: store.trialStartedAt,
        }
      : { reason: "no_connected_store", storeId: null };
  }

  const stores = await prisma.store.findMany({
    where: connectedStoreWhere,
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      accessTokenCiphertext: true,
      commercialStatus: true,
      createdAt: true,
      id: true,
      installedAt: true,
      nuvemshopStoreId: true,
      trialEndsAt: true,
      trialStartedAt: true,
    },
    take: 2,
  });

  if (stores.length === 1 && stores[0].accessTokenCiphertext) {
    return {
      accessTokenCiphertext: stores[0].accessTokenCiphertext,
      commercialStatus: stores[0].commercialStatus,
      createdAt: stores[0].createdAt,
      installedAt: stores[0].installedAt,
      providerStoreId: stores[0].nuvemshopStoreId,
      reason: "ok",
      storeId: stores[0].id,
      trialEndsAt: stores[0].trialEndsAt,
      trialStartedAt: stores[0].trialStartedAt,
    };
  }

  return {
    reason: stores.length === 0 ? "no_connected_store" : "store_id_required",
    storeId: null,
  };
}

function readLocalizedValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const localized = value as Record<string, unknown>;
  const preferred = localized.pt ?? localized["pt-BR"] ?? localized.en;

  if (typeof preferred === "string" && preferred.trim()) {
    return preferred.trim();
  }

  for (const item of Object.values(localized)) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
  }

  return null;
}

function normalizePublicUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());

    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function readJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data = (await response.json()) as unknown;

    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function getSuggestedProductUrl(args: {
  accessTokenCiphertext: string;
  productId: string;
  providerStoreId: string;
}): Promise<string | null> {
  try {
    const accessToken = decryptAccessTokenFromStorage(args.accessTokenCiphertext);
    const baseUrl = `${NUVEMSHOP_API_BASE_URL}/${encodeURIComponent(args.providerStoreId)}`;
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
    };
    const productResponse = await fetch(`${baseUrl}/products/${encodeURIComponent(args.productId)}`, {
      headers,
      cache: "no-store",
    });

    if (!productResponse.ok) {
      console.warn("Nuvemshop product lookup failed.", {
        productId: args.productId,
        providerStoreId: args.providerStoreId,
        status: productResponse.status,
      });

      return null;
    }

    const product = await readJsonObject(productResponse);
    const canonicalUrl = normalizePublicUrl(product?.canonical_url);

    if (canonicalUrl) {
      return canonicalUrl;
    }

    const handle = readLocalizedValue(product?.handle);

    if (!handle) {
      return null;
    }

    const storeResponse = await fetch(`${baseUrl}/store`, {
      headers,
      cache: "no-store",
    });

    if (!storeResponse.ok) {
      console.warn("Nuvemshop store lookup failed for product URL fallback.", {
        providerStoreId: args.providerStoreId,
        status: storeResponse.status,
      });

      return null;
    }

    const store = await readJsonObject(storeResponse);
    const originalDomain = readLocalizedValue(store?.original_domain);

    if (!originalDomain) {
      return null;
    }

    const storeOrigin = originalDomain.startsWith("http") ? originalDomain : `https://${originalDomain}`;

    return normalizePublicUrl(`${storeOrigin.replace(/\/+$/, "")}/produtos/${handle}/`);
  } catch (error) {
    console.warn("Suggested product URL lookup failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });

    return null;
  }
}

export async function GET(request: NextRequest) {
  const productId = readQueryValue(request, "productId");

  if (!productId) {
    return publicJson({ error: "productId is required." }, 400);
  }

  try {
    const store = await findPublicStore(readQueryValue(request, "storeId"));

    if (store.reason === "store_id_required") {
      return publicJson({ error: "storeId is required when multiple stores are connected." }, 400);
    }

    if (!store.storeId) {
      return offerNotFound();
    }

    const commercialAccess = resolveStoreCommercialAccess(store);

    if (!commercialAccess.canDisplayWidget) {
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

    const suggestedProductUrl = await getSuggestedProductUrl({
      accessTokenCiphertext: store.accessTokenCiphertext,
      productId: offer.suggestedProductId,
      providerStoreId: store.providerStoreId,
    });

    return publicJson({
      offer: {
        principalProductId: productId,
        suggestedProduct: {
          id: offer.suggestedProductId,
          name: offer.suggestedProductName,
          url: suggestedProductUrl,
        },
      },
    });
  } catch (error) {
    console.warn("Public offer lookup failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });

    return publicJson({ error: "Unable to load offer." }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: publicOfferHeaders,
  });
}

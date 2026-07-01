import { type NextRequest, NextResponse } from "next/server";

import { getCommercialStatus, type CommercialStatus } from "@/src/lib/billing/commercial-status";
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

type PublicProductSummary = {
  compareAtPrice: string | null;
  id: string;
  imageUrl: string | null;
  name: string;
  path: string | null;
  price: string | null;
  promotionalPrice: string | null;
  url: string | null;
  variantId: string | null;
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

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return cleanString(value);
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

function normalizePublicPath(value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}${url.hash}`;

    return path.startsWith("/") ? path : null;
  } catch {
    return null;
  }
}

function readPrimaryImageUrl(product: Record<string, unknown>): string | null {
  if (!Array.isArray(product.images)) {
    return null;
  }

  for (const image of product.images) {
    if (!image || typeof image !== "object" || Array.isArray(image)) {
      continue;
    }

    const imageRecord = image as Record<string, unknown>;
    const imageUrl = normalizePublicUrl(imageRecord.src) ?? normalizePublicUrl(imageRecord.url);

    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

function readProductVariant(product: Record<string, unknown>): Record<string, unknown> | null {
  if (!Array.isArray(product.variants)) {
    return null;
  }

  for (const variant of product.variants) {
    if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
      continue;
    }

    const variantRecord = variant as Record<string, unknown>;
    const stock = typeof variantRecord.stock === "number" ? variantRecord.stock : null;
    const stockManagement = typeof variantRecord.stock_management === "boolean" ? variantRecord.stock_management : false;

    if (!stockManagement || stock === null || stock > 0) {
      return variantRecord;
    }
  }

  const firstVariant = product.variants.find(
    (variant) => variant && typeof variant === "object" && !Array.isArray(variant),
  );

  return firstVariant ? (firstVariant as Record<string, unknown>) : null;
}

function readPrice(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  return cleanString(value);
}

async function readJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data = (await response.json()) as unknown;

    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeProductSummary(args: {
  fallbackName: string;
  product: Record<string, unknown>;
  productId: string;
  url: string | null;
}): PublicProductSummary {
  const variant = readProductVariant(args.product);
  const price = readPrice(variant?.price);
  const promotionalPrice = readPrice(variant?.promotional_price);

  return {
    compareAtPrice: readPrice(variant?.compare_at_price),
    id: cleanId(args.product.id) ?? args.productId,
    imageUrl: readPrimaryImageUrl(args.product),
    name: readLocalizedValue(args.product.name) ?? args.fallbackName,
    path: normalizePublicPath(args.url),
    price,
    promotionalPrice,
    url: args.url,
    variantId: cleanId(variant?.id),
  };
}

async function getSuggestedProductSummary(args: {
  accessTokenCiphertext: string;
  fallbackName: string;
  productId: string;
  providerStoreId: string;
}): Promise<PublicProductSummary | null> {
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
    const fallbackSummary = {
      compareAtPrice: null,
      id: args.productId,
      imageUrl: null,
      name: args.fallbackName,
      path: null,
      price: null,
      promotionalPrice: null,
      url: null,
      variantId: null,
    };

    if (!product) {
      return fallbackSummary;
    }

    const canonicalUrl = normalizePublicUrl(product.canonical_url);

    if (canonicalUrl) {
      return normalizeProductSummary({
        fallbackName: args.fallbackName,
        product,
        productId: args.productId,
        url: canonicalUrl,
      });
    }

    const handle = readLocalizedValue(product.handle);

    if (!handle) {
      return normalizeProductSummary({
        fallbackName: args.fallbackName,
        product,
        productId: args.productId,
        url: null,
      });
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
      return normalizeProductSummary({
        fallbackName: args.fallbackName,
        product,
        productId: args.productId,
        url: null,
      });
    }

    const storeOrigin = originalDomain.startsWith("http") ? originalDomain : `https://${originalDomain}`;

    const productUrl = normalizePublicUrl(`${storeOrigin.replace(/\/+$/, "")}/produtos/${handle}/`);

    return normalizeProductSummary({
      fallbackName: args.fallbackName,
      product,
      productId: args.productId,
      url: productUrl,
    });
  } catch (error) {
    console.warn("Suggested product lookup failed.", {
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

    const commercialAccess = await getCommercialStatus(store.storeId);

    if (!commercialAccess?.canDisplayWidget) {
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

    const suggestedProduct = await getSuggestedProductSummary({
      accessTokenCiphertext: store.accessTokenCiphertext,
      fallbackName: offer.suggestedProductName,
      productId: offer.suggestedProductId,
      providerStoreId: store.providerStoreId,
    });

    return publicJson({
      offer: {
        principalProductId: productId,
        suggestedProduct: suggestedProduct ?? {
          compareAtPrice: null,
          id: offer.suggestedProductId,
          imageUrl: null,
          name: offer.suggestedProductName,
          path: null,
          price: null,
          promotionalPrice: null,
          url: null,
          variantId: null,
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

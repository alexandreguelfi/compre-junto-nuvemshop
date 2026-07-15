import { type NextRequest, NextResponse } from "next/server";

import { getCommercialStatus, type CommercialStatus } from "@/src/lib/billing/commercial-status";
import { decryptAccessTokenFromStorage } from "@/src/lib/nuvemshop/auth";
import { prisma } from "@/src/lib/prisma";
import {
  areStorefrontDiagnosticsEnabled,
  isSafeNuvemshopId,
  isStorefrontDiagnosticModeRequested,
  readStorefrontTechnology,
  type StorefrontResultCode,
  type StorefrontTechnology,
} from "@/src/lib/storefront/diagnostics";
import { classifyMatchingOffers } from "@/src/lib/storefront/offer-policy";
import { resolveStoreCandidate } from "@/src/lib/storefront/store-resolution";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NUVEMSHOP_API_VERSION = "2025-03";
const NUVEMSHOP_API_BASE_URL = `https://api.tiendanube.com/${NUVEMSHOP_API_VERSION}`;
const USER_AGENT = "CompreJuntoNuvemshop atendimento@casasmartnest.com.br";

const publicOfferHeaders = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
};

type PublicStore = {
  accessTokenCiphertext: string;
  commercialStatus: CommercialStatus;
  createdAt: Date;
  installedAt: Date;
  providerStoreId: string;
  storeId: string;
  trialEndsAt: Date | null;
  trialStartedAt: Date | null;
};

type PublicStoreLookup =
  | { reason: "ok"; store: PublicStore }
  | { reason: "store_not_connected" | "store_ambiguous"; store: null };

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

type RequestDiagnostic = {
  enabled: boolean;
  productId: string | null;
  providerStoreId: string | null;
  technology: StorefrontTechnology;
};

function readQueryValue(request: NextRequest, key: string): string | null {
  return request.nextUrl.searchParams.get(key)?.trim() || null;
}

function getRequestDiagnostic(request: NextRequest): RequestDiagnostic {
  return {
    enabled:
      areStorefrontDiagnosticsEnabled() &&
      ["cj_debug", "compre_junto_debug", "nubesdk_debug"].some((key) =>
        isStorefrontDiagnosticModeRequested(readQueryValue(request, key)),
      ),
    productId: readQueryValue(request, "productId"),
    providerStoreId: readQueryValue(request, "storeId"),
    technology: readStorefrontTechnology(readQueryValue(request, "technology")),
  };
}

function logStorefrontResult(diagnostic: RequestDiagnostic, code: StorefrontResultCode, details = {}) {
  console.info("Storefront offer diagnostic.", {
    code,
    productId: diagnostic.productId,
    storeId: diagnostic.providerStoreId,
    technology: diagnostic.technology,
    ...details,
  });
}

function diagnosticBody(diagnostic: RequestDiagnostic, code: StorefrontResultCode) {
  if (!diagnostic.enabled) {
    return {};
  }

  return {
    diagnostic: {
      code,
      productDetected: Boolean(diagnostic.productId),
      productId: diagnostic.productId,
      scriptLoaded: true,
      storeDetected: Boolean(diagnostic.providerStoreId),
      storeId: diagnostic.providerStoreId,
      technology: diagnostic.technology,
    },
  };
}

function publicJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: publicOfferHeaders });
}

function offerNotFound(diagnostic: RequestDiagnostic, code: StorefrontResultCode, status = 200) {
  logStorefrontResult(diagnostic, code);
  return publicJson({ offer: null, ...diagnosticBody(diagnostic, code) }, status);
}

const publicStoreSelect = {
  accessTokenCiphertext: true,
  commercialStatus: true,
  createdAt: true,
  id: true,
  installedAt: true,
  nuvemshopStoreId: true,
  trialEndsAt: true,
  trialStartedAt: true,
} as const;

function normalizeStore(store: {
  accessTokenCiphertext: string | null;
  commercialStatus: CommercialStatus;
  createdAt: Date;
  id: string;
  installedAt: Date;
  nuvemshopStoreId: string;
  trialEndsAt: Date | null;
  trialStartedAt: Date | null;
}): PublicStore | null {
  return store.accessTokenCiphertext
    ? {
        accessTokenCiphertext: store.accessTokenCiphertext,
        commercialStatus: store.commercialStatus,
        createdAt: store.createdAt,
        installedAt: store.installedAt,
        providerStoreId: store.nuvemshopStoreId,
        storeId: store.id,
        trialEndsAt: store.trialEndsAt,
        trialStartedAt: store.trialStartedAt,
      }
    : null;
}

async function findPublicStore(providerStoreId: string | null): Promise<PublicStoreLookup> {
  const connectedWhere = {
    accessTokenCiphertext: { not: null },
    status: "CONNECTED" as const,
  };

  if (providerStoreId) {
    const store = await prisma.store.findUnique({
      where: { nuvemshopStoreId: providerStoreId, ...connectedWhere },
      select: publicStoreSelect,
    });
    const normalized = store ? normalizeStore(store) : null;
    return resolveStoreCandidate(normalized ? [normalized] : [], providerStoreId);
  }

  const stores = await prisma.store.findMany({ where: connectedWhere, select: publicStoreSelect, take: 2 });

  return resolveStoreCandidate(stores.map(normalizeStore).filter((store): store is PublicStore => Boolean(store)), null);
}

function readLocalizedValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const localized = value as Record<string, unknown>;
  const preferred = localized.pt ?? localized["pt-BR"] ?? localized.en;
  if (typeof preferred === "string" && preferred.trim()) return preferred.trim();

  return Object.values(localized).find((item): item is string => typeof item === "string" && Boolean(item.trim()))?.trim() ?? null;
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanId(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : cleanString(value);
}

function normalizePublicUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizePublicPath(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.startsWith("/") ? value : null;
  }
}

function readPrimaryImageUrl(product: Record<string, unknown>): string | null {
  if (!Array.isArray(product.images)) return null;
  for (const image of product.images) {
    if (image && typeof image === "object" && !Array.isArray(image)) {
      const record = image as Record<string, unknown>;
      const url = normalizePublicUrl(record.src) ?? normalizePublicUrl(record.url);
      if (url) return url;
    }
  }
  return null;
}

function readProductVariant(product: Record<string, unknown>): Record<string, unknown> | null {
  if (!Array.isArray(product.variants)) return null;
  const variants = product.variants.filter(
    (variant): variant is Record<string, unknown> => Boolean(variant) && typeof variant === "object" && !Array.isArray(variant),
  );
  return (
    variants.find((variant) => {
      const stock = typeof variant.stock === "number" ? variant.stock : null;
      return variant.stock_management !== true || stock === null || stock > 0;
    }) ?? null
  );
}

function readPrice(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : cleanString(value);
}

async function readJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data = (await response.json()) as unknown;
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function fallbackProduct(productId: string, name: string): PublicProductSummary {
  return {
    compareAtPrice: null,
    id: productId,
    imageUrl: null,
    name,
    path: null,
    price: null,
    promotionalPrice: null,
    url: null,
    variantId: null,
  };
}

function normalizeProductSummary(product: Record<string, unknown>, productId: string, fallbackName: string, url: string | null) {
  const variant = readProductVariant(product);
  return {
    compareAtPrice: readPrice(variant?.compare_at_price),
    id: cleanId(product.id) ?? productId,
    imageUrl: readPrimaryImageUrl(product),
    name: readLocalizedValue(product.name) ?? fallbackName,
    path: normalizePublicPath(url),
    price: readPrice(variant?.price),
    promotionalPrice: readPrice(variant?.promotional_price),
    url,
    variantId: cleanId(variant?.id),
  } satisfies PublicProductSummary;
}

async function getProductSummary(args: {
  accessToken: string;
  fallbackName: string;
  productId: string;
  providerStoreId: string;
}): Promise<{ failed: boolean; product: PublicProductSummary }> {
  const baseUrl = `${NUVEMSHOP_API_BASE_URL}/${encodeURIComponent(args.providerStoreId)}`;
  const headers = { Accept: "application/json", Authorization: `Bearer ${args.accessToken}`, "User-Agent": USER_AGENT };

  try {
    const response = await fetch(`${baseUrl}/products/${encodeURIComponent(args.productId)}`, {
      headers,
      cache: "no-store",
    });
    if (!response.ok) return { failed: true, product: fallbackProduct(args.productId, args.fallbackName) };

    const product = await readJsonObject(response);
    if (!product) return { failed: true, product: fallbackProduct(args.productId, args.fallbackName) };
    if (cleanId(product.id) !== args.productId) {
      return { failed: true, product: fallbackProduct(args.productId, args.fallbackName) };
    }

    const canonicalUrl = normalizePublicUrl(product.canonical_url);
    if (canonicalUrl) return { failed: false, product: normalizeProductSummary(product, args.productId, args.fallbackName, canonicalUrl) };

    const handle = readLocalizedValue(product.handle);
    if (!handle) return { failed: false, product: normalizeProductSummary(product, args.productId, args.fallbackName, null) };

    const storeResponse = await fetch(`${baseUrl}/store`, { headers, cache: "no-store" });
    const store = storeResponse.ok ? await readJsonObject(storeResponse) : null;
    const originalDomain = readLocalizedValue(store?.original_domain);
    const url = originalDomain
      ? normalizePublicUrl(`${originalDomain.startsWith("http") ? originalDomain : `https://${originalDomain}`}/produtos/${handle}/`)
      : null;

    return { failed: false, product: normalizeProductSummary(product, args.productId, args.fallbackName, url) };
  } catch {
    return { failed: true, product: fallbackProduct(args.productId, args.fallbackName) };
  }
}

export async function GET(request: NextRequest) {
  const diagnostic = getRequestDiagnostic(request);
  logStorefrontResult(diagnostic, "storefront_script_loaded");

  if (!isSafeNuvemshopId(diagnostic.productId)) {
    return offerNotFound(diagnostic, "product_id_unavailable", 400);
  }
  if (diagnostic.providerStoreId && !isSafeNuvemshopId(diagnostic.providerStoreId)) {
    return offerNotFound(diagnostic, "store_id_unavailable", 400);
  }

  try {
    const lookup = await findPublicStore(diagnostic.providerStoreId);
    if (!lookup.store) {
      return offerNotFound(diagnostic, lookup.reason, lookup.reason === "store_ambiguous" ? 400 : 200);
    }

    diagnostic.providerStoreId = lookup.store.providerStoreId;
    const commercialAccess = await getCommercialStatus(lookup.store.storeId);
    if (!commercialAccess?.canDisplayWidget) return offerNotFound(diagnostic, "commercial_access_denied");

    const matchingOffers = await prisma.crossSellOffer.findMany({
      where: {
        storeId: lookup.store.storeId,
        triggers: { some: { triggerProductId: diagnostic.productId } },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        isActive: true,
        suggestedProductId: true,
        suggestedProductName: true,
        triggers: {
          where: { triggerProductId: diagnostic.productId },
          select: { triggerProductName: true },
          take: 1,
        },
      },
    });
    const activeOfferCount = matchingOffers.length
      ? 0
      : await prisma.crossSellOffer.count({ where: { storeId: lookup.store.storeId, isActive: true } });
    const availability = classifyMatchingOffers(matchingOffers, activeOfferCount);
    const offer = availability.offer;
    if (!offer) return offerNotFound(diagnostic, availability.code);

    const accessToken = decryptAccessTokenFromStorage(lookup.store.accessTokenCiphertext);
    const [principalResult, suggestedResult] = await Promise.all([
      getProductSummary({
        accessToken,
        fallbackName: offer.triggers[0]?.triggerProductName ?? `Produto ${diagnostic.productId}`,
        productId: diagnostic.productId,
        providerStoreId: lookup.store.providerStoreId,
      }),
      getProductSummary({
        accessToken,
        fallbackName: offer.suggestedProductName,
        productId: offer.suggestedProductId,
        providerStoreId: lookup.store.providerStoreId,
      }),
    ]);
    const resultCode = suggestedResult.failed ? "suggested_product_lookup_failed" : "offer_found";
    logStorefrontResult(diagnostic, resultCode, { principalProductLookupFailed: principalResult.failed });

    if (suggestedResult.failed) {
      return publicJson({ offer: null, ...diagnosticBody(diagnostic, resultCode) });
    }

    return publicJson({
      offer: {
        principalProduct: principalResult.product,
        principalProductId: diagnostic.productId,
        suggestedProduct: suggestedResult.product,
      },
      ...diagnosticBody(diagnostic, resultCode),
    });
  } catch (error) {
    console.warn("Public offer lookup failed.", {
      code: "offer_not_found",
      name: error instanceof Error ? error.name : "unknown",
      productId: diagnostic.productId,
      storeId: diagnostic.providerStoreId,
      technology: diagnostic.technology,
    });
    return publicJson({ offer: null, ...diagnosticBody(diagnostic, "offer_not_found") }, 500);
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: publicOfferHeaders });
}

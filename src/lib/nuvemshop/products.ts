import { decryptAccessTokenFromStorage } from "@/src/lib/nuvemshop/auth";
import { prisma } from "@/src/lib/prisma";

const NUVEMSHOP_API_VERSION = "2025-03";
const NUVEMSHOP_API_BASE_URL = `https://api.tiendanube.com/${NUVEMSHOP_API_VERSION}`;
const USER_AGENT = "CompreJuntoNuvemshop atendimento@casasmartnest.com.br";
const DEFAULT_PRODUCT_LIMIT = 50;

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

export type NuvemshopAdminProduct = {
  handle: string | null;
  id: string;
  imageUrl: string | null;
  name: string;
  status: string | null;
  url: string | null;
};

type ConnectedStoreCredentials = {
  accessToken: string;
  providerStoreId: string;
};

export class NuvemshopProductsError extends Error {
  constructor(
    message: string,
    readonly safeDetails: Record<string, string | number | boolean | null> = {},
  ) {
    super(message);
    this.name = "NuvemshopProductsError";
  }
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

function readPrimaryImageUrl(product: Record<string, unknown>): string | null {
  if (!Array.isArray(product.images)) {
    return null;
  }

  for (const image of product.images) {
    if (!image || typeof image !== "object") {
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

function readProductStatus(product: Record<string, unknown>): string | null {
  const explicitStatus = cleanString(product.status);

  if (explicitStatus) {
    return explicitStatus;
  }

  if (typeof product.published === "boolean") {
    return product.published ? "published" : "unpublished";
  }

  return null;
}

function normalizeProduct(product: unknown): NuvemshopAdminProduct | null {
  if (!product || typeof product !== "object" || Array.isArray(product)) {
    return null;
  }

  const productRecord = product as Record<string, unknown>;
  const id = cleanId(productRecord.id);

  if (!id) {
    return null;
  }

  return {
    handle: readLocalizedValue(productRecord.handle),
    id,
    imageUrl: readPrimaryImageUrl(productRecord),
    name: readLocalizedValue(productRecord.name) ?? `Produto ${id}`,
    status: readProductStatus(productRecord),
    url:
      normalizePublicUrl(productRecord.canonical_url) ??
      normalizePublicUrl(productRecord.url) ??
      normalizePublicUrl(productRecord.permalink),
  };
}

function productMatchesQuery(product: NuvemshopAdminProduct, query: string | null): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();

  return [product.id, product.name, product.handle, product.status]
    .filter((item): item is string => Boolean(item))
    .some((item) => item.toLowerCase().includes(normalizedQuery));
}

async function readConnectedStoreCredentials(): Promise<ConnectedStoreCredentials | null> {
  const store = await prisma.store.findFirst({
    where: connectedStoreWhere,
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      accessTokenCiphertext: true,
      nuvemshopStoreId: true,
    },
  });

  if (!store?.accessTokenCiphertext) {
    return null;
  }

  return {
    accessToken: decryptAccessTokenFromStorage(store.accessTokenCiphertext),
    providerStoreId: store.nuvemshopStoreId,
  };
}

async function readJsonArray(response: Response): Promise<unknown[]> {
  try {
    const data = (await response.json()) as unknown;

    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function listConnectedStoreProducts({
  limit = DEFAULT_PRODUCT_LIMIT,
  query = null,
}: {
  limit?: number;
  query?: string | null;
} = {}): Promise<NuvemshopAdminProduct[]> {
  const credentials = await readConnectedStoreCredentials();

  if (!credentials) {
    return [];
  }

  const productsUrl = new URL(`${NUVEMSHOP_API_BASE_URL}/${encodeURIComponent(credentials.providerStoreId)}/products`);
  const safeLimit = Math.max(1, Math.min(limit, DEFAULT_PRODUCT_LIMIT));

  productsUrl.searchParams.set("per_page", String(safeLimit));

  const response = await fetch(productsUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credentials.accessToken}`,
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new NuvemshopProductsError("Nuvemshop products lookup failed", {
      httpStatus: response.status,
      providerStoreId: credentials.providerStoreId,
      responseBodyPresent: Boolean((await response.text()).trim()),
    });
  }

  const normalizedQuery = query?.trim().toLowerCase() || null;

  return (await readJsonArray(response))
    .map(normalizeProduct)
    .filter((product): product is NuvemshopAdminProduct => Boolean(product))
    .filter((product) => productMatchesQuery(product, normalizedQuery));
}

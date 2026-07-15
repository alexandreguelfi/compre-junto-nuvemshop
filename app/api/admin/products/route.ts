import crypto from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { getEnv } from "@/src/lib/env";
import { listConnectedStoreProducts, NuvemshopProductsError } from "@/src/lib/nuvemshop/products";
import { getConnectedStore, getConnectedStoreByProviderId } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);

  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(request: NextRequest): boolean {
  const providedSecret = request.headers.get("x-admin-secret")?.trim() || readBearerToken(request);
  const expectedSecret = getEnv().COMPRE_JUNTO_ADMIN_SECRET;

  return typeof providedSecret === "string" && safeEqual(providedSecret, expectedSecret);
}

function getSafeErrorDetails(error: unknown) {
  if (error instanceof NuvemshopProductsError) {
    return {
      name: error.name,
      ...error.safeDetails,
    };
  }

  return {
    name: error instanceof Error ? error.name : "unknown",
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() || null;
  const requestedStoreId = request.nextUrl.searchParams.get("storeId")?.trim() || null;

  try {
    const store = requestedStoreId
      ? await getConnectedStoreByProviderId(requestedStoreId)
      : await getConnectedStore();

    if (!store) {
      return jsonResponse({ error: "A unique connected store is required." }, 400);
    }

    const products = await listConnectedStoreProducts({ query, storeId: store.id });

    return jsonResponse({
      limit: 50,
      products,
      query,
    });
  } catch (error) {
    console.warn("Admin products lookup failed.", getSafeErrorDetails(error));

    return jsonResponse({ error: "Unable to load products." }, 502);
  }
}

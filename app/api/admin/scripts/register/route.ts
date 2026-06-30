import crypto from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { getEnv } from "@/src/lib/env";
import { decryptAccessTokenFromStorage, NuvemshopAuthError } from "@/src/lib/nuvemshop/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NUVEMSHOP_API_VERSION = "2025-03";
const NUVEMSHOP_API_BASE_URL = `https://api.tiendanube.com/${NUVEMSHOP_API_VERSION}`;
const USER_AGENT = "CompreJuntoNuvemshop atendimento@casasmartnest.com.br";
const WIDGET_URL = "https://compre-junto-nuvemshop-production.up.railway.app/widget/compre-junto.js";

type RegisterScriptBody = {
  queryParams?: unknown;
  scriptId?: unknown;
};

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

function getSafeError(error: unknown) {
  if (error instanceof NuvemshopAuthError) {
    return {
      name: error.name,
      ...error.safeDetails,
    };
  }

  return {
    name: error instanceof Error ? error.name : "unknown",
  };
}

function readScriptId(body: RegisterScriptBody): string | null {
  return typeof body.scriptId === "string" && body.scriptId.trim() ? body.scriptId.trim() : null;
}

function buildQueryParams(body: RegisterScriptBody): string {
  const defaultQueryParams: Record<string, string> = {
    widgetUrl: WIDGET_URL,
  };

  if (!body.queryParams || typeof body.queryParams !== "object" || Array.isArray(body.queryParams)) {
    return JSON.stringify(defaultQueryParams);
  }

  return JSON.stringify({
    ...defaultQueryParams,
    ...(body.queryParams as Record<string, unknown>),
  });
}

async function readRequestBody(request: NextRequest): Promise<RegisterScriptBody> {
  try {
    return (await request.json()) as RegisterScriptBody;
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return jsonResponse({ error: "Unauthorized." }, 401);
  }

  const body = await readRequestBody(request);
  const scriptId = readScriptId(body);

  if (!scriptId) {
    return jsonResponse(
      {
        error: "scriptId is required.",
        details:
          "Nuvemshop Scripts API associates an existing Partner Portal script by script_id. It does not accept a direct widget src_url in this endpoint.",
        widgetUrl: WIDGET_URL,
      },
      400,
    );
  }

  try {
    const store = await prisma.store.findFirst({
      where: {
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
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        accessTokenCiphertext: true,
        id: true,
        nuvemshopStoreId: true,
        scopes: true,
        updatedAt: true,
      },
    });

    if (!store?.accessTokenCiphertext) {
      return jsonResponse({ error: "Connected store with access token was not found." }, 404);
    }

    if (!store.scopes.includes("write_scripts") && !store.scopes.includes("scripts")) {
      return jsonResponse(
        {
          error: "Connected store is missing write_scripts scope.",
          providerStoreId: store.nuvemshopStoreId,
          scopes: store.scopes,
        },
        403,
      );
    }

    const accessToken = decryptAccessTokenFromStorage(store.accessTokenCiphertext);
    const response = await fetch(`${NUVEMSHOP_API_BASE_URL}/${encodeURIComponent(store.nuvemshopStoreId)}/scripts`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        query_params: buildQueryParams(body),
        script_id: scriptId,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return jsonResponse(
        {
          error: "Nuvemshop Scripts API request failed.",
          nuvemshopStatus: response.status,
          responseBodyPresent: Boolean((await response.text()).trim()),
        },
        502,
      );
    }

    return jsonResponse({
      status: "registered",
      providerStoreId: store.nuvemshopStoreId,
      scriptId,
      widgetUrl: WIDGET_URL,
      queryParams: buildQueryParams(body),
      nuvemshopStatus: response.status,
    });
  } catch (error) {
    console.warn("Nuvemshop script registration failed.", getSafeError(error));

    return jsonResponse({ error: "Unable to register storefront script." }, 500);
  }
}

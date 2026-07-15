import crypto from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";

import { getEnv } from "@/src/lib/env";
import { decryptAccessTokenFromStorage, NuvemshopAuthError } from "@/src/lib/nuvemshop/auth";
import {
  planScriptRegistrations,
  hasAnotherScriptsPage,
  readOfficialScriptId,
  readRegisteredScriptIds,
  type StorefrontScriptConfig,
} from "@/src/lib/nuvemshop/script-registration";
import { prisma } from "@/src/lib/prisma";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NUVEMSHOP_API_VERSION = "2025-03";
const NUVEMSHOP_API_BASE_URL = `https://api.tiendanube.com/${NUVEMSHOP_API_VERSION}`;
const USER_AGENT = "CompreJuntoNuvemshop atendimento@casasmartnest.com.br";
const APP_ORIGIN = "https://compre-junto-nuvemshop-production.up.railway.app";
const LEGACY_WIDGET_URL = `${APP_ORIGIN}/widget/compre-junto.js`;
const NUBESDK_BUNDLE_URL = `${APP_ORIGIN}/nube/compre-junto.js`;

type RegisterScriptBody = {
  storeId?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) return null;
  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(request: NextRequest): boolean {
  const providedSecret = request.headers.get("x-admin-secret")?.trim() || readBearerToken(request);
  const expectedSecret = getEnv().COMPRE_JUNTO_ADMIN_SECRET;
  return typeof providedSecret === "string" && safeEqual(providedSecret, expectedSecret);
}

function getSafeError(error: unknown) {
  if (error instanceof NuvemshopAuthError) return { name: error.name, ...error.safeDetails };
  return { name: error instanceof Error ? error.name : "unknown" };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readRequestBody(request: NextRequest): Promise<RegisterScriptBody> {
  return request.json().catch(() => ({})) as Promise<RegisterScriptBody>;
}

function getScriptConfigs(providerStoreId: string): StorefrontScriptConfig[] {
  const legacyScriptId = readOfficialScriptId(process.env.NUVEMSHOP_LEGACY_SCRIPT_ID);
  const nubesdkScriptId = readOfficialScriptId(process.env.NUVEMSHOP_NUBESDK_SCRIPT_ID);
  const configs: StorefrontScriptConfig[] = [];

  if (legacyScriptId) {
    configs.push({
      kind: "legacy",
      scriptId: legacyScriptId,
      queryParams: {
        storeId: providerStoreId,
        widgetUrl: LEGACY_WIDGET_URL,
      },
    });
  }
  if (nubesdkScriptId) {
    configs.push({
      kind: "nubesdk",
      scriptId: nubesdkScriptId,
      queryParams: {
        bundleUrl: NUBESDK_BUNDLE_URL,
      },
    });
  }

  return configs;
}

async function listRegisteredScriptIds(scriptsUrl: string, headers: Record<string, string>) {
  const ids = new Set<string>();
  const perPage = 30;

  for (let page = 1; page <= 20; page += 1) {
    const pageUrl = new URL(scriptsUrl);
    pageUrl.searchParams.set("page", String(page));
    pageUrl.searchParams.set("per_page", String(perPage));
    const response = await fetch(pageUrl, { headers, cache: "no-store" });
    if (!response.ok) throw new NuvemshopAuthError("Unable to inspect existing script associations.", { httpStatus: response.status });
    const payload = await response.json().catch(() => null);
    for (const id of readRegisteredScriptIds(payload)) ids.add(id);
    if (!hasAnotherScriptsPage(payload, page, perPage)) break;
  }

  return ids;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return jsonResponse({ error: "Unauthorized." }, 401);

  const body = await readRequestBody(request);

  try {
    const requestedProviderStoreId = readString(body.storeId);
    const sessionStore = requestedProviderStoreId ? null : await getConnectedStore();
    const store = requestedProviderStoreId
      ? await prisma.store.findUnique({
          where: {
            nuvemshopStoreId: requestedProviderStoreId,
            accessTokenCiphertext: { not: null },
            status: "CONNECTED",
          },
          select: { accessTokenCiphertext: true, id: true, nuvemshopStoreId: true, scopes: true },
        })
      : sessionStore
        ? await prisma.store.findUnique({
            where: { id: sessionStore.id },
            select: { accessTokenCiphertext: true, id: true, nuvemshopStoreId: true, scopes: true },
          })
        : null;

    if (!store?.accessTokenCiphertext) {
      return jsonResponse({ error: "A unique connected store is required. Send storeId or use an installation session." }, 400);
    }
    if (!store.scopes.includes("write_scripts") && !store.scopes.includes("scripts")) {
      return jsonResponse({ error: "Connected store is missing write_scripts scope.", providerStoreId: store.nuvemshopStoreId }, 403);
    }

    const configs = getScriptConfigs(store.nuvemshopStoreId);
    const accessToken = decryptAccessTokenFromStorage(store.accessTokenCiphertext);
    const scriptsUrl = `${NUVEMSHOP_API_BASE_URL}/${encodeURIComponent(store.nuvemshopStoreId)}/scripts`;
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    };
    const registeredScriptIds = await listRegisteredScriptIds(scriptsUrl, headers);
    const plan = planScriptRegistrations(configs, registeredScriptIds);
    const configuredKinds = new Set(configs.map((config) => config.kind));
    const results: Array<Record<string, unknown>> = [];
    if (!configuredKinds.has("legacy")) results.push({ kind: "legacy", status: "configuration_missing" });
    if (!configuredKinds.has("nubesdk")) results.push({ kind: "nubesdk", status: "configuration_missing" });

    for (const item of plan) {
      if (item.action === "already_registered") {
        results.push({ kind: item.kind, scriptId: item.scriptId, status: "already_registered" });
        continue;
      }

      try {
        const response = await fetch(scriptsUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ query_params: JSON.stringify(item.queryParams), script_id: Number(item.scriptId) }),
          cache: "no-store",
        });

        results.push({
          kind: item.kind,
          scriptId: item.scriptId,
          status: response.ok ? "registered" : "failed",
          nuvemshopStatus: response.status,
        });
      } catch (error) {
        results.push({ kind: item.kind, scriptId: item.scriptId, status: "failed", error: getSafeError(error) });
      }
    }

    return jsonResponse({
      providerStoreId: store.nuvemshopStoreId,
      results,
      automatic: "Associates configured, non-auto-installable Partner Portal scripts with this store.",
      manual:
        "Creating, uploading/publishing versions, selecting legacy versus NubeSDK runtime, and activating auto-installable scripts remain Partner Portal actions.",
    });
  } catch (error) {
    console.warn("Nuvemshop script registration failed.", getSafeError(error));
    return jsonResponse({ error: "Unable to register storefront scripts." }, 500);
  }
}

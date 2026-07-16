import crypto from "node:crypto";

import { getEnv, getNuvemshopCallbackUrl } from "@/src/lib/env";
import { createSignedInstallState, validateSignedInstallState } from "@/src/lib/nuvemshop/install-state";
import { buildTokenExchangeRequest, NUVEMSHOP_TOKEN_URL } from "@/src/lib/nuvemshop/token-request";

const NUVEMSHOP_AUTHORIZE_BASE_URL = "https://www.nuvemshop.com.br/apps/";

export type NuvemshopToken = {
  accessToken: string;
  scopes: string[];
  storeId: string;
};

export class NuvemshopAuthError extends Error {
  constructor(
    message: string,
    readonly safeDetails: Record<string, string | number | boolean | null> = {},
  ) {
    super(message);
    this.name = "NuvemshopAuthError";
  }
}

function getStateSecret(): string {
  return getEnv().COMPRE_JUNTO_ADMIN_SECRET;
}

export function createInstallState(): string {
  return createSignedInstallState({
    redirectUri: getNuvemshopCallbackUrl(),
    secret: getStateSecret(),
  });
}

export function validateInstallState(state: string | null): boolean {
  if (!state) {
    return false;
  }

  return validateSignedInstallState(state, {
    redirectUri: getNuvemshopCallbackUrl(),
    secret: getStateSecret(),
  });
}

export function buildInstallUrl(): URL {
  const env = getEnv();
  const state = createInstallState();
  const url = new URL(`${encodeURIComponent(env.NUVEMSHOP_CLIENT_ID)}/authorize`, NUVEMSHOP_AUTHORIZE_BASE_URL);

  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", getNuvemshopCallbackUrl());

  return url;
}

function parseScopes(scope: unknown): string[] {
  if (Array.isArray(scope)) {
    return scope.filter((item): item is string => typeof item === "string" && item.length > 0);
  }

  if (typeof scope !== "string") {
    return [];
  }

  return scope
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function asStoreId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getTokenEndpointHost(): string {
  return new URL(NUVEMSHOP_TOKEN_URL).hostname;
}

async function hasResponseBody(response: Response): Promise<boolean> {
  try {
    return Boolean((await response.clone().text()).trim());
  } catch {
    return false;
  }
}

export async function exchangeCodeForToken(code: string): Promise<NuvemshopToken> {
  const env = getEnv();
  const response = await fetch(
    NUVEMSHOP_TOKEN_URL,
    buildTokenExchangeRequest(code, {
      clientId: env.NUVEMSHOP_CLIENT_ID,
      clientSecret: env.NUVEMSHOP_CLIENT_SECRET,
    }),
  );

  if (!response.ok) {
    throw new NuvemshopAuthError("Nuvemshop token exchange failed", {
      stage: "token_exchange",
      httpStatus: response.status,
      responseBodyPresent: await hasResponseBody(response),
      responseContentType: response.headers.get("content-type"),
      tokenEndpointHost: getTokenEndpointHost(),
    });
  }

  let data: Record<string, unknown>;

  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new NuvemshopAuthError("Nuvemshop token response was not valid JSON", {
      stage: "token_response_parse",
      httpStatus: response.status,
      responseContentType: response.headers.get("content-type"),
      tokenEndpointHost: getTokenEndpointHost(),
    });
  }

  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  const storeId = asStoreId(data.user_id ?? data.store_id);

  if (!accessToken || !storeId) {
    throw new NuvemshopAuthError("Nuvemshop token response was missing required fields", {
      stage: "token_response_validation",
      httpStatus: response.status,
      hasAccessToken: Boolean(accessToken),
      hasUserId: data.user_id !== undefined,
      hasStoreId: data.store_id !== undefined,
      hasScope: data.scope !== undefined,
      tokenEndpointHost: getTokenEndpointHost(),
    });
  }

  return {
    accessToken,
    scopes: parseScopes(data.scope),
    storeId,
  };
}

export function encryptAccessTokenForStorage(accessToken: string): string {
  const key = crypto.createHash("sha256").update(getEnv().COMPRE_JUNTO_ADMIN_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptAccessTokenFromStorage(accessTokenCiphertext: string): string {
  const [version, iv, authTag, ciphertext] = accessTokenCiphertext.split(":");

  if (version !== "v1" || !iv || !authTag || !ciphertext) {
    throw new NuvemshopAuthError("Stored Nuvemshop access token format is invalid", {
      stage: "token_decryption",
    });
  }

  const key = crypto.createHash("sha256").update(getEnv().COMPRE_JUNTO_ADMIN_SECRET).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));

  decipher.setAuthTag(Buffer.from(authTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

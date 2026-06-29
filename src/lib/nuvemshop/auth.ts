import crypto from "node:crypto";

import { getEnv, getNuvemshopCallbackUrl } from "@/src/lib/env";

const NUVEMSHOP_WEB_BASE_URL = "https://www.nuvemshop.com.br";
const NUVEMSHOP_TOKEN_URL = "https://www.nuvemshop.com.br/apps/authorize/token";
const INSTALL_STATE_MAX_AGE_MS = 10 * 60 * 1000;

type InstallStatePayload = {
  issuedAt: number;
  nonce: string;
  redirectUri: string;
};

export type NuvemshopToken = {
  accessToken: string;
  scopes: string[];
  storeId: string;
};

export class NuvemshopAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NuvemshopAuthError";
  }
}

function getStateSecret(): string {
  return getEnv().COMPRE_JUNTO_ADMIN_SECRET;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createInstallState(): string {
  const payload = base64UrlJson({
    issuedAt: Date.now(),
    nonce: crypto.randomBytes(24).toString("base64url"),
    redirectUri: getNuvemshopCallbackUrl(),
  } satisfies InstallStatePayload);

  return `${payload}.${signPayload(payload)}`;
}

export function validateInstallState(state: string | null): boolean {
  if (!state) {
    return false;
  }

  const [payload, signature] = state.split(".");

  if (!payload || !signature || !safeEqual(signature, signPayload(payload))) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<InstallStatePayload>;
    const issuedAt = typeof parsed.issuedAt === "number" ? parsed.issuedAt : 0;
    const redirectUri = typeof parsed.redirectUri === "string" ? parsed.redirectUri : "";

    return Date.now() - issuedAt <= INSTALL_STATE_MAX_AGE_MS && redirectUri === getNuvemshopCallbackUrl();
  } catch {
    return false;
  }
}

export function buildInstallUrl(): URL {
  const env = getEnv();
  const state = createInstallState();
  const url = new URL(`/apps/${encodeURIComponent(env.NUVEMSHOP_CLIENT_ID)}/authorize`, NUVEMSHOP_WEB_BASE_URL);

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

export async function exchangeCodeForToken(code: string): Promise<NuvemshopToken> {
  const env = getEnv();
  const response = await fetch(NUVEMSHOP_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.NUVEMSHOP_CLIENT_ID,
      client_secret: env.NUVEMSHOP_CLIENT_SECRET,
      code,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new NuvemshopAuthError(`Nuvemshop token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  const accessToken = typeof data.access_token === "string" ? data.access_token : "";
  const storeId = asStoreId(data.user_id ?? data.store_id);

  if (!accessToken || !storeId) {
    throw new NuvemshopAuthError("Nuvemshop token response was missing required fields");
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

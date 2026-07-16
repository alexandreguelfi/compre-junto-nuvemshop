import crypto from "node:crypto";

const INSTALL_STATE_MAX_AGE_MS = 10 * 60 * 1000;

type InstallStatePayload = {
  issuedAt: number;
  nonce: string;
  redirectUri: string;
};

type InstallStateOptions = {
  now?: number;
  redirectUri: string;
  secret: string;
};

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSignedInstallState({
  now = Date.now(),
  redirectUri,
  secret,
}: InstallStateOptions): string {
  const payload = base64UrlJson({
    issuedAt: now,
    nonce: crypto.randomBytes(24).toString("base64url"),
    redirectUri,
  } satisfies InstallStatePayload);

  return `${payload}.${signPayload(payload, secret)}`;
}

export function validateSignedInstallState(
  state: string,
  { now = Date.now(), redirectUri, secret }: InstallStateOptions,
): boolean {
  const parts = state.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [payload, signature] = parts;

  if (!payload || !signature || !safeEqual(signature, signPayload(payload, secret))) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<InstallStatePayload>;
    const age = typeof parsed.issuedAt === "number" ? now - parsed.issuedAt : Number.NaN;

    return (
      Number.isSafeInteger(parsed.issuedAt) &&
      age >= 0 &&
      age <= INSTALL_STATE_MAX_AGE_MS &&
      typeof parsed.nonce === "string" &&
      /^[A-Za-z0-9_-]{32}$/.test(parsed.nonce) &&
      parsed.redirectUri === redirectUri
    );
  } catch {
    return false;
  }
}

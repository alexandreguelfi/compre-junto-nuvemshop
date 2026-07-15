import crypto from "node:crypto";

export type AdminStoreSession = {
  issuedAt: number;
  providerStoreId: string;
};

function sign(payload: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSignedAdminStoreSession(providerStoreId: string, secret: string, now: number) {
  const payload = Buffer.from(JSON.stringify({ issuedAt: now, providerStoreId } satisfies AdminStoreSession), "utf8").toString(
    "base64url",
  );

  return `${payload}.${sign(payload, secret)}`;
}

export function readSignedAdminStoreSession(
  value: string | null | undefined,
  secret: string,
  maxAgeSeconds: number,
  now: number,
): string | null {
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;

  if (!payload || !signature || !safeEqual(signature, sign(payload, secret))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AdminStoreSession>;
    const maxAgeMs = maxAgeSeconds * 1000;

    if (
      typeof parsed.issuedAt !== "number" ||
      parsed.issuedAt > now ||
      now - parsed.issuedAt > maxAgeMs ||
      typeof parsed.providerStoreId !== "string" ||
      !/^\d{1,30}$/.test(parsed.providerStoreId)
    ) {
      return null;
    }

    return parsed.providerStoreId;
  } catch {
    return null;
  }
}

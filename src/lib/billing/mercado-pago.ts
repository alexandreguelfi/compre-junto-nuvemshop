import crypto from "node:crypto";

import {
  getBillingPlanConfig,
  mapInternalStatusToStoreCommercialStatus,
  mapMercadoPagoStatusToInternalStatus,
  type BillingStatus,
} from "@/src/lib/billing/commercial-status";
import { prisma } from "@/src/lib/prisma";

const MERCADO_PAGO_API_BASE_URL = "https://api.mercadopago.com";
const BILLING_PROVIDER = "MERCADO_PAGO" as const;

type MercadoPagoSubscriptionPayload = {
  auto_recurring?: {
    end_date?: unknown;
    next_payment_date?: unknown;
  };
  external_reference?: unknown;
  id?: unknown;
  init_point?: unknown;
  next_payment_date?: unknown;
  preapproval_plan_id?: unknown;
  status?: unknown;
};

export type BillingCheckout = {
  checkoutUrl: string;
  initPoint: string;
  providerSubscriptionId: string | null;
  status: BillingStatus;
};

export class MercadoPagoBillingError extends Error {
  constructor(
    message: string,
    readonly safeDetails: Record<string, unknown> = {},
    readonly status = 500,
  ) {
    super(message);
    this.name = "MercadoPagoBillingError";
  }
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isSensitiveKey(key: string) {
  return /token|secret|authorization|password|card|cvv|security/i.test(key);
}

export function sanitizeForSafeLog(value: unknown, depth = 0): unknown {
  if (depth > 4) {
    return "[truncated]";
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeForSafeLog(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? "[redacted]" : sanitizeForSafeLog(item, depth + 1),
      ]),
    );
  }

  return null;
}

function cleanEmail(value: unknown): string | null {
  const email = cleanString(value);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return email.toLowerCase();
}

function buildHostedPlanCheckoutUrl(preapprovalPlanId: string) {
  const url = new URL("https://www.mercadopago.com.br/subscriptions/checkout");
  url.searchParams.set("preapproval_plan_id", preapprovalPlanId);

  return url.toString();
}

function getAccessToken(): string {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();

  if (!accessToken) {
    throw new MercadoPagoBillingError("Mercado Pago access token is not configured.", {
      reason: "missing_access_token",
    }, 503);
  }

  return accessToken;
}

function parseDate(value: unknown): Date | null {
  const raw = cleanString(value);

  if (!raw) {
    return null;
  }

  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date;
}

function readStoreIdFromExternalReference(value: unknown): string | null {
  const externalReference = cleanString(value);

  if (!externalReference) {
    return null;
  }

  const [kind, , storeId] = externalReference.split(":");

  return kind === "store" && storeId ? storeId : null;
}

async function readJsonObject(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const payload = (await response.json()) as unknown;

    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function mercadoPagoRequest(path: string, init: RequestInit) {
  const response = await fetch(`${MERCADO_PAGO_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const payload = await readJsonObject(response);

  if (!response.ok) {
    throw new MercadoPagoBillingError("Mercado Pago request failed.", {
      cause: sanitizeForSafeLog(payload?.cause) ?? null,
      endpoint: path,
      error: cleanString(payload?.error),
      httpStatus: response.status,
      message: cleanString(payload?.message),
      responseBody: sanitizeForSafeLog(payload),
    }, response.status >= 400 && response.status < 500 ? 502 : 503);
  }

  return payload;
}

function normalizeSubscriptionPayload(payload: Record<string, unknown> | null): MercadoPagoSubscriptionPayload {
  return payload ?? {};
}

function readSubscriptionId(payload: MercadoPagoSubscriptionPayload) {
  const subscriptionId = cleanString(payload.id);

  if (!subscriptionId) {
    throw new MercadoPagoBillingError("Mercado Pago response missing subscription id.", {
      reason: "missing_subscription_id",
    }, 502);
  }

  return subscriptionId;
}

function getCurrentPeriodEnd(payload: MercadoPagoSubscriptionPayload) {
  return (
    parseDate(payload.next_payment_date) ??
    parseDate(payload.auto_recurring?.next_payment_date) ??
    parseDate(payload.auto_recurring?.end_date)
  );
}

export async function createCheckoutForStore(
  storeId: string,
  payerEmailInput?: string | null,
): Promise<BillingCheckout> {
  const config = getBillingPlanConfig();
  const store = await prisma.store.findUnique({
    where: {
      id: storeId,
    },
    select: {
      email: true,
      id: true,
    },
  });

  if (!store) {
    throw new MercadoPagoBillingError("Store not found for billing checkout.", {
      reason: "store_not_found",
    }, 404);
  }

  if (!config.mercadoPagoPlanId) {
    throw new MercadoPagoBillingError("Mercado Pago plan id is not configured.", {
      reason: "missing_plan_id",
    }, 503);
  }

  const payerEmail = cleanEmail(payerEmailInput);

  if (payerEmail && !store.email) {
    await prisma.store.update({
      where: {
        id: store.id,
      },
      data: {
        email: payerEmail,
      },
    });
  }

  const checkoutUrl = buildHostedPlanCheckoutUrl(config.mercadoPagoPlanId);

  return {
    checkoutUrl,
    initPoint: checkoutUrl,
    providerSubscriptionId: null,
    status: "PENDING",
  };
}

export async function syncMercadoPagoSubscription(providerSubscriptionId: string) {
  const payload = normalizeSubscriptionPayload(
    await mercadoPagoRequest(`/preapproval/${encodeURIComponent(providerSubscriptionId)}`, {
      method: "GET",
    }),
  );
  const subscriptionId = readSubscriptionId(payload);
  const existingSubscription = await prisma.billingSubscription.findUnique({
    where: {
      providerSubscriptionId: subscriptionId,
    },
    select: {
      storeId: true,
      trialEndsAt: true,
    },
  });
  const storeId = existingSubscription?.storeId ?? readStoreIdFromExternalReference(payload.external_reference);

  if (!storeId) {
    throw new MercadoPagoBillingError("Unable to match Mercado Pago subscription to a store.", {
      providerSubscriptionId: subscriptionId,
      reason: "store_match_missing",
    }, 422);
  }

  const externalStatus = cleanString(payload.status) ?? "pending";
  const status = mapMercadoPagoStatusToInternalStatus(externalStatus);
  const checkoutUrl = cleanString(payload.init_point);
  const currentPeriodEnd = getCurrentPeriodEnd(payload);
  const savedSubscription = await prisma.billingSubscription.upsert({
    where: {
      providerSubscriptionId: subscriptionId,
    },
    create: {
      checkoutUrl,
      currentPeriodEnd,
      externalStatus,
      initPoint: checkoutUrl,
      provider: BILLING_PROVIDER,
      providerPlanId: cleanString(payload.preapproval_plan_id),
      providerSubscriptionId: subscriptionId,
      status,
      storeId,
      trialEndsAt: existingSubscription?.trialEndsAt ?? null,
    },
    update: {
      canceledAt: status === "CANCELED" ? new Date() : null,
      checkoutUrl,
      currentPeriodEnd,
      externalStatus,
      initPoint: checkoutUrl,
      providerPlanId: cleanString(payload.preapproval_plan_id),
      status,
    },
    select: {
      id: true,
      status: true,
      storeId: true,
    },
  });

  await prisma.store.update({
    where: {
      id: storeId,
    },
    data: {
      commercialStatus: mapInternalStatusToStoreCommercialStatus(status),
    },
  });

  return savedSubscription;
}

function parseSignatureHeader(value: string | null) {
  if (!value) {
    return null;
  }

  const parts = Object.fromEntries(
    value.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");

      return [key, rest.join("=")];
    }),
  );

  return {
    timestamp: cleanString(parts.ts),
    v1: cleanString(parts.v1),
  };
}

function safeEqualHex(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function validateMercadoPagoWebhookSignature(args: {
  dataId: string | null;
  secret: string;
  xRequestId: string | null;
  xSignature: string | null;
}) {
  const signature = parseSignatureHeader(args.xSignature);

  if (!signature?.timestamp || !signature.v1 || !args.xRequestId || !args.dataId) {
    return false;
  }

  const manifest = `id:${args.dataId};request-id:${args.xRequestId};ts:${signature.timestamp};`;
  const expected = crypto.createHmac("sha256", args.secret).update(manifest).digest("hex");

  return safeEqualHex(expected, signature.v1);
}

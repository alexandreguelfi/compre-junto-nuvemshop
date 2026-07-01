import { type NextRequest, NextResponse } from "next/server";

import type { Prisma } from "@/lib/generated/prisma/client";
import {
  MercadoPagoBillingError,
  sanitizeForSafeLog,
  syncMercadoPagoSubscription,
  validateMercadoPagoWebhookSignature,
} from "@/src/lib/billing/mercado-pago";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MercadoPagoWebhookStatus = "PROCESSED" | "FAILED" | "SKIPPED";

type MercadoPagoWebhookPayload = {
  action?: unknown;
  api_version?: unknown;
  data?: {
    id?: unknown;
  };
  date_created?: unknown;
  id?: unknown;
  live_mode?: unknown;
  type?: unknown;
  user_id?: unknown;
};

const SUPPORTED_TOPICS = new Set([
  "payment",
  "subscription_authorized_payment",
  "subscription_preapproval",
  "subscription_preapproval_plan",
]);

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function cleanString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readDataId(request: NextRequest, payload: MercadoPagoWebhookPayload | null) {
  return (
    cleanString(request.nextUrl.searchParams.get("data.id")) ??
    cleanString(request.nextUrl.searchParams.get("data_id")) ??
    cleanString(payload?.data?.id) ??
    cleanString(payload?.id)
  );
}

function getWebhookTopic(payload: MercadoPagoWebhookPayload | null) {
  return cleanString(payload?.type) ?? "unknown";
}

function isSimulation(payload: MercadoPagoWebhookPayload | null) {
  return payload?.live_mode === false;
}

function isStructurallyValidWebhook(payload: MercadoPagoWebhookPayload | null, dataId: string | null) {
  return Boolean(payload && dataId && cleanString(payload.action) && cleanString(payload.type));
}

function getDeduplicationKey(args: { dataId: string; payload: MercadoPagoWebhookPayload | null; topic: string }) {
  const eventId = cleanString(args.payload?.id);
  const action = cleanString(args.payload?.action);
  const liveMode = isSimulation(args.payload) ? "test" : "live";

  return ["mercado_pago", liveMode, args.topic, args.dataId, eventId, action].filter(Boolean).join(":");
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(sanitizeForSafeLog(value) ?? {})) as Prisma.InputJsonValue;
}

function getSafeWebhookDetails(payload: MercadoPagoWebhookPayload | null, dataId: string | null) {
  return {
    action: cleanString(payload?.action),
    apiVersion: cleanString(payload?.api_version),
    dataId,
    eventId: cleanString(payload?.id),
    hasUserId: payload?.user_id !== undefined,
    liveMode: payload?.live_mode === true ? "live" : payload?.live_mode === false ? "test" : "missing",
    topic: getWebhookTopic(payload),
  };
}

async function recordWebhookEvent(args: {
  dataId: string;
  payload: MercadoPagoWebhookPayload | null;
  status: MercadoPagoWebhookStatus;
  storeId?: string | null;
  topic: string;
}) {
  const deduplicationKey = getDeduplicationKey({
    dataId: args.dataId,
    payload: args.payload,
    topic: args.topic,
  });

  await prisma.webhookEvent.upsert({
    where: {
      deduplicationKey,
    },
    create: {
      attempts: 1,
      deduplicationKey,
      payload: toPrismaJson(args.payload),
      processedAt: args.status === "FAILED" ? null : new Date(),
      provider: "mercado_pago",
      resourceId: args.dataId,
      status: args.status,
      storeId: args.storeId ?? null,
      topic: args.topic,
    },
    update: {
      attempts: {
        increment: 1,
      },
      payload: toPrismaJson(args.payload),
      processedAt: args.status === "FAILED" ? null : new Date(),
      status: args.status,
      storeId: args.storeId ?? null,
    },
  });
}

function getSafeBillingError(error: unknown) {
  if (error instanceof MercadoPagoBillingError) {
    return error.safeDetails;
  }

  return {
    reason: error instanceof Error ? error.name : "unknown",
  };
}

function isSignatureAccepted(request: NextRequest, dataId: string | null) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();

  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  return validateMercadoPagoWebhookSignature({
    dataId,
    secret,
    xRequestId: request.headers.get("x-request-id"),
    xSignature: request.headers.get("x-signature"),
  });
}

async function acknowledgeWithoutSync(args: {
  dataId: string;
  payload: MercadoPagoWebhookPayload | null;
  reason: string;
  topic: string;
}) {
  console.info("Mercado Pago webhook acknowledged without billing sync.", {
    ...getSafeWebhookDetails(args.payload, args.dataId),
    reason: args.reason,
  });

  await recordWebhookEvent({
    dataId: args.dataId,
    payload: args.payload,
    status: "SKIPPED",
    topic: args.topic,
  }).catch(() => undefined);

  return jsonResponse({ ok: true, reason: args.reason });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as MercadoPagoWebhookPayload | null;
  const dataId = readDataId(request, payload);
  const topic = getWebhookTopic(payload);

  if (!isStructurallyValidWebhook(payload, dataId)) {
    return jsonResponse({ error: "Invalid Mercado Pago webhook payload." }, 400);
  }

  if (!dataId) {
    return jsonResponse({ error: "Invalid Mercado Pago webhook payload." }, 400);
  }

  const resourceId = dataId;

  if (isSimulation(payload)) {
    console.info("Mercado Pago webhook simulation received.", getSafeWebhookDetails(payload, resourceId));

    await recordWebhookEvent({
      dataId: resourceId,
      payload,
      status: "SKIPPED",
      topic,
    }).catch(() => undefined);

    return jsonResponse({ ok: true, reason: "simulation" });
  }

  if (!isSignatureAccepted(request, resourceId)) {
    return jsonResponse({ error: "Invalid Mercado Pago webhook signature." }, 401);
  }

  if (!SUPPORTED_TOPICS.has(topic)) {
    return acknowledgeWithoutSync({
      dataId: resourceId,
      payload,
      reason: "unsupported_topic",
      topic,
    });
  }

  if (topic !== "subscription_preapproval") {
    return acknowledgeWithoutSync({
      dataId: resourceId,
      payload,
      reason: "topic_does_not_update_subscription",
      topic,
    });
  }

  try {
    const subscription = await syncMercadoPagoSubscription(resourceId);

    await recordWebhookEvent({
      dataId: resourceId,
      payload,
      status: "PROCESSED",
      storeId: subscription.storeId,
      topic,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    console.warn("Mercado Pago subscription webhook processing failed.", {
      ...getSafeWebhookDetails(payload, resourceId),
      ...getSafeBillingError(error),
    });

    await recordWebhookEvent({
      dataId: resourceId,
      payload,
      status: "FAILED",
      topic,
    }).catch(() => undefined);

    return jsonResponse({ error: "Unable to process Mercado Pago webhook." }, 502);
  }
}

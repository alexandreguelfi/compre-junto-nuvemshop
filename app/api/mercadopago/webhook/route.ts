import { type NextRequest, NextResponse } from "next/server";

import {
  MercadoPagoBillingError,
  syncMercadoPagoSubscription,
  validateMercadoPagoWebhookSignature,
} from "@/src/lib/billing/mercado-pago";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MercadoPagoWebhookPayload = {
  action?: unknown;
  data?: {
    id?: unknown;
  };
  id?: unknown;
  type?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function cleanString(value: unknown): string | null {
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
  return cleanString(payload?.type) ?? cleanString(payload?.action) ?? "mercado_pago";
}

function getDeduplicationKey(args: { dataId: string; payload: MercadoPagoWebhookPayload | null; topic: string }) {
  const eventId = cleanString(args.payload?.id);
  const action = cleanString(args.payload?.action);

  return ["mercado_pago", args.topic, args.dataId, eventId, action].filter(Boolean).join(":");
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

async function recordWebhookEvent(args: {
  dataId: string;
  payload: MercadoPagoWebhookPayload | null;
  status: "PROCESSED" | "FAILED";
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
      processedAt: args.status === "PROCESSED" ? new Date() : null,
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
      processedAt: args.status === "PROCESSED" ? new Date() : null,
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

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as MercadoPagoWebhookPayload | null;
  const dataId = readDataId(request, payload);
  const topic = getWebhookTopic(payload);

  if (!isSignatureAccepted(request, dataId)) {
    return jsonResponse({ error: "Invalid Mercado Pago webhook signature." }, 401);
  }

  if (!dataId) {
    return jsonResponse({ error: "Mercado Pago webhook data id is required." }, 400);
  }

  try {
    const subscription = await syncMercadoPagoSubscription(dataId);

    await recordWebhookEvent({
      dataId,
      payload,
      status: "PROCESSED",
      storeId: subscription.storeId,
      topic,
    });

    return jsonResponse({ ok: true });
  } catch (error) {
    console.warn("Mercado Pago webhook processing failed.", getSafeBillingError(error));

    await recordWebhookEvent({
      dataId,
      payload,
      status: "FAILED",
      topic,
    }).catch(() => undefined);

    return jsonResponse({ error: "Unable to process Mercado Pago webhook." }, 502);
  }
}

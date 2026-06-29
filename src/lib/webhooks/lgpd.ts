import { AuditActorType } from "@/lib/generated/prisma/client";
import { prisma } from "@/src/lib/prisma";

type LgpdTopic = "store-redact" | "customers-redact" | "customers-data-request";

type ParsedWebhookBody = {
  isValidJson: boolean;
  payload: unknown;
};

const AUDIT_TIMEOUT_MS = 1200;

export async function parseWebhookJson(request: Request): Promise<ParsedWebhookBody> {
  try {
    return {
      isValidJson: true,
      payload: await request.json(),
    };
  } catch {
    return {
      isValidJson: false,
      payload: null,
    };
  }
}

function getPayloadKeys(payload: unknown): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  return Object.keys(payload).slice(0, 20);
}

function getExternalStoreId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const value = record.store_id ?? record.storeId ?? record.user_id ?? record.userId;

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getSignatureStatus(headers: Headers): "present" | "missing" {
  const possibleSignatureHeaders = [
    "x-linkedstore-hmac-sha256",
    "x-nuvemshop-hmac-sha256",
    "x-tiendanube-hmac-sha256",
    "x-hmac-sha256",
  ];

  return possibleSignatureHeaders.some((header) => Boolean(headers.get(header))) ? "present" : "missing";
}

async function findInternalStoreId(externalStoreId: string | null): Promise<string | null> {
  if (!externalStoreId) {
    return null;
  }

  const store = await prisma.store.findUnique({
    where: {
      nuvemshopStoreId: externalStoreId,
    },
    select: {
      id: true,
    },
  });

  return store?.id ?? null;
}

async function writeAuditLog(topic: LgpdTopic, parsedBody: ParsedWebhookBody, headers: Headers): Promise<void> {
  const externalStoreId = getExternalStoreId(parsedBody.payload);
  const storeId = await findInternalStoreId(externalStoreId);

  await prisma.auditLog.create({
    data: {
      storeId,
      actorType: AuditActorType.WEBHOOK,
      action: `lgpd.${topic}`,
      entityType: "LGPDWebhook",
      metadata: {
        isValidJson: parsedBody.isValidJson,
        payloadKeys: getPayloadKeys(parsedBody.payload),
        hasExternalStoreId: Boolean(externalStoreId),
        signatureHeader: getSignatureStatus(headers),
      },
    },
  });
}

export async function recordLgpdWebhook(topic: LgpdTopic, parsedBody: ParsedWebhookBody, headers: Headers): Promise<void> {
  await Promise.race([
    writeAuditLog(topic, parsedBody, headers),
    new Promise<void>((resolve) => {
      setTimeout(resolve, AUDIT_TIMEOUT_MS);
    }),
  ]).catch(() => undefined);
}

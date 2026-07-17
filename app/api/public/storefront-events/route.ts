import {
  parseStorefrontEventPayload,
} from "../../../../src/lib/storefront/diagnostics.ts";
import { resolvePublicTelemetryCors } from "../../../../src/lib/storefront/public-telemetry-cors.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024;
const DEDUPE_WINDOW_MS = 15_000;
const MAX_DEDUPE_ENTRIES = 500;
const recentEvents = new Map<string, number>();

async function readSmallJsonBody(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) return null;
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

function isDuplicate(key: string, now = Date.now()) {
  const previous = recentEvents.get(key);
  if (previous && now - previous < DEDUPE_WINDOW_MS) return true;

  recentEvents.set(key, now);
  if (recentEvents.size > MAX_DEDUPE_ENTRIES) {
    for (const [entryKey, timestamp] of recentEvents) {
      if (now - timestamp >= DEDUPE_WINDOW_MS || recentEvents.size > MAX_DEDUPE_ENTRIES) recentEvents.delete(entryKey);
      if (recentEvents.size <= MAX_DEDUPE_ENTRIES) break;
    }
  }
  return false;
}

export async function POST(request: Request) {
  const cors = resolvePublicTelemetryCors(request);
  if (!cors.allowed) return Response.json({ ok: false }, { status: 403, headers: cors.headers });

  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return Response.json({ ok: false }, { status: 415, headers: cors.headers });
  }

  const payload = parseStorefrontEventPayload(await readSmallJsonBody(request));
  if (!payload) {
    return Response.json({ ok: false }, { status: 400, headers: cors.headers });
  }

  const eventKey = `${payload.technology}:${payload.storeId}:${payload.productId}:${payload.code}`;
  if (isDuplicate(eventKey)) return Response.json({ ok: true, deduplicated: true }, { headers: cors.headers });

  console.info("Storefront client diagnostic.", payload);
  return Response.json({ ok: true }, { headers: cors.headers });
}

export async function OPTIONS(request: Request) {
  const cors = resolvePublicTelemetryCors(request);
  return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });
}

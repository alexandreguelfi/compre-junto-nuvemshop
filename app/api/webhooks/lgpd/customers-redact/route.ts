import { parseWebhookJson, recordLgpdWebhook } from "@/src/lib/webhooks/lgpd";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsedBody = await parseWebhookJson(request);

  await recordLgpdWebhook("customers-redact", parsedBody, request.headers);

  return new Response(null, { status: 204 });
}

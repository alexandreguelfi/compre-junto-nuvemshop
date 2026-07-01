import { type NextRequest, NextResponse } from "next/server";

import { createCheckoutForStore, MercadoPagoBillingError } from "@/src/lib/billing/mercado-pago";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readPayerEmail(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await request.json().catch(() => null)) as { payerEmail?: unknown } | null;

    return readText(payload?.payerEmail);
  }

  const formData = await request.formData().catch(() => null);

  return readText(formData?.get("payerEmail"));
}

function getSafeBillingError(error: unknown) {
  if (error instanceof MercadoPagoBillingError) {
    return {
      message: error.message,
      safeDetails: error.safeDetails,
      status: error.status,
    };
  }

  return {
    message: "Unable to create Mercado Pago checkout.",
    safeDetails: {
      reason: error instanceof Error ? error.name : "unknown",
    },
    status: 500,
  };
}

export async function POST(request: NextRequest) {
  const store = await getConnectedStore();

  if (!store?.id) {
    return jsonResponse({ error: "Loja conectada nao encontrada." }, 401);
  }

  try {
    const checkout = await createCheckoutForStore(store.id, await readPayerEmail(request));

    return jsonResponse({
      checkoutUrl: checkout.checkoutUrl,
      initPoint: checkout.initPoint,
      providerSubscriptionId: checkout.providerSubscriptionId,
      status: checkout.status,
    });
  } catch (error) {
    const safeError = getSafeBillingError(error);

    console.warn("Mercado Pago checkout creation failed.", safeError.safeDetails);

    return jsonResponse({ error: safeError.message }, safeError.status);
  }
}

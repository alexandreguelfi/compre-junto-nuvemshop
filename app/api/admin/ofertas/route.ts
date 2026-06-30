import { NextResponse } from "next/server";

import { prisma } from "@/src/lib/prisma";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function readRequiredField(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing field: ${fieldName}`);
  }

  return value.trim();
}

function readForwardedHeader(request: Request, headerName: string): string | null {
  return request.headers.get(headerName)?.split(",")[0]?.trim() || null;
}

function getRequestOrigin(request: Request): string {
  const requestUrl = new URL(request.url);
  const forwardedHost = readForwardedHeader(request, "x-forwarded-host");
  const forwardedProto = readForwardedHeader(request, "x-forwarded-proto");
  const host = forwardedHost ?? request.headers.get("host") ?? requestUrl.host;
  const protocol = forwardedProto ?? requestUrl.protocol.replace(":", "");

  return `${protocol}://${host}`;
}

export async function POST(request: Request) {
  const store = await getConnectedStore();

  if (!store) {
    return NextResponse.json({ error: "Loja conectada nao encontrada." }, { status: 401 });
  }

  try {
    const formData = await request.formData();

    await prisma.crossSellOffer.create({
      data: {
        storeId: store.id,
        suggestedProductId: readRequiredField(formData, "suggestedProductId"),
        suggestedProductName: readRequiredField(formData, "suggestedProductName"),
        isActive: formData.get("isActive") !== "false",
        triggers: {
          create: {
            triggerProductId: readRequiredField(formData, "triggerProductId"),
            triggerProductName: readRequiredField(formData, "triggerProductName"),
          },
        },
      },
    });

    return NextResponse.redirect(new URL("/admin/ofertas", getRequestOrigin(request)), { status: 303 });
  } catch {
    return NextResponse.json({ error: "Nao foi possivel salvar a oferta." }, { status: 400 });
  }
}

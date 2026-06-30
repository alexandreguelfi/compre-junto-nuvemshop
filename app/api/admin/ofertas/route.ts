import { NextResponse } from "next/server";

import { prisma } from "@/src/lib/prisma";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OfferFormInput = {
  suggestedProductId: string;
  suggestedProductName: string;
  triggerProductId: string;
  triggerProductName: string;
  isActive: boolean;
};

function readTextField(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function parseOfferForm(formData: FormData): OfferFormInput {
  return {
    suggestedProductId: readTextField(formData, "suggestedProductId"),
    suggestedProductName: readTextField(formData, "suggestedProductName"),
    triggerProductId: readTextField(formData, "triggerProductId"),
    triggerProductName: readTextField(formData, "triggerProductName"),
    isActive: formData.get("isActive") !== "false",
  };
}

function getValidationError(input: OfferFormInput): string | null {
  if (!input.triggerProductId) {
    return "Informe o ID do produto principal.";
  }

  if (!input.triggerProductName) {
    return "Informe o nome do produto principal.";
  }

  if (!input.suggestedProductId) {
    return "Informe o ID do produto sugerido.";
  }

  if (!input.suggestedProductName) {
    return "Informe o nome do produto sugerido.";
  }

  if (input.triggerProductId === input.suggestedProductId) {
    return "O produto principal e o produto sugerido devem ser diferentes.";
  }

  return null;
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

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const store = await getConnectedStore();

  if (!store?.id) {
    return jsonError("Loja conectada nao encontrada.", 401);
  }

  let input: OfferFormInput;

  try {
    input = parseOfferForm(await request.formData());
  } catch (error) {
    console.warn("Cross-sell offer form parsing failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });

    return jsonError("Dados da oferta invalidos.", 400);
  }

  const validationError = getValidationError(input);

  if (validationError) {
    return jsonError(validationError, 400);
  }

  try {
    if (input.isActive) {
      const duplicateOffer = await prisma.crossSellOffer.findFirst({
        where: {
          storeId: store.id,
          isActive: true,
          triggers: {
            some: {
              triggerProductId: input.triggerProductId,
            },
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicateOffer) {
        return jsonError(
          "Ja existe uma oferta ativa para este produto principal nesta loja. Desative a oferta existente ou crie esta como inativa.",
          409,
        );
      }
    }

    await prisma.crossSellOffer.create({
      data: {
        storeId: store.id,
        suggestedProductId: input.suggestedProductId,
        suggestedProductName: input.suggestedProductName,
        isActive: input.isActive,
        triggers: {
          create: {
            triggerProductId: input.triggerProductId,
            triggerProductName: input.triggerProductName,
          },
        },
      },
    });

    return NextResponse.redirect(new URL("/admin/ofertas?created=1", getRequestOrigin(request)), { status: 303 });
  } catch (error) {
    console.warn("Cross-sell offer creation failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });

    return jsonError("Nao foi possivel salvar a oferta agora.", 500);
  }
}

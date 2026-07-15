import { NextResponse } from "next/server";

import { getCommercialStatus } from "@/src/lib/billing/commercial-status";
import { getConnectedStoreProductsByIds } from "@/src/lib/nuvemshop/products";
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

const OFFER_FORM_MESSAGES = {
  duplicateActive:
    "Este produto principal ja tem uma oferta ativa. Desative a oferta existente ou crie esta como inativa.",
  invalidFormData: "Dados da oferta invalidos.",
  missingFields: "Preencha todos os itens obrigatórios para salvar a oferta.",
  missingStore: "Loja conectada nao encontrada.",
  missingSuggestedName: "Informe o nome do produto sugerido para continuar.",
  missingSuggestedProduct: "Selecione o produto sugerido para continuar.",
  missingTriggerName: "Informe o nome do produto principal para continuar.",
  missingTriggerProduct: "Selecione o produto principal para continuar.",
  sameProduct: "Escolha produtos diferentes para criar uma oferta Compre Junto.",
  saveFailed: "Nao foi possivel salvar a oferta agora.",
  productsNotFound: "Os produtos selecionados nao pertencem ao catalogo desta instalacao.",
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
  const missingTriggerProduct = !input.triggerProductId;
  const missingTriggerName = Boolean(input.triggerProductId) && !input.triggerProductName;
  const missingSuggestedProduct = !input.suggestedProductId;
  const missingSuggestedName = Boolean(input.suggestedProductId) && !input.suggestedProductName;
  const missingItems = [
    missingTriggerProduct,
    missingTriggerName,
    missingSuggestedProduct,
    missingSuggestedName,
  ].filter(Boolean).length;

  if (missingItems > 1) {
    return OFFER_FORM_MESSAGES.missingFields;
  }

  if (missingTriggerProduct) {
    return OFFER_FORM_MESSAGES.missingTriggerProduct;
  }

  if (missingTriggerName) {
    return OFFER_FORM_MESSAGES.missingTriggerName;
  }

  if (missingSuggestedProduct) {
    return OFFER_FORM_MESSAGES.missingSuggestedProduct;
  }

  if (missingSuggestedName) {
    return OFFER_FORM_MESSAGES.missingSuggestedName;
  }

  if (input.triggerProductId === input.suggestedProductId) {
    return OFFER_FORM_MESSAGES.sameProduct;
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
    return jsonError(OFFER_FORM_MESSAGES.missingStore, 401);
  }

  const commercialAccess = await getCommercialStatus(store.id);

  if (!commercialAccess?.canCreateOffer) {
    return jsonError(commercialAccess?.message ?? "Acesso comercial nao liberado.", 403);
  }

  let input: OfferFormInput;

  try {
    input = parseOfferForm(await request.formData());
  } catch (error) {
    console.warn("Cross-sell offer form parsing failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });

    return jsonError(OFFER_FORM_MESSAGES.invalidFormData, 400);
  }

  const validationError = getValidationError(input);

  if (validationError) {
    return jsonError(validationError, 400);
  }

  try {
    const products = await getConnectedStoreProductsByIds(store.id, [input.triggerProductId, input.suggestedProductId]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const triggerProduct = productById.get(input.triggerProductId);
    const suggestedProduct = productById.get(input.suggestedProductId);
    if (!triggerProduct || !suggestedProduct) return jsonError(OFFER_FORM_MESSAGES.productsNotFound, 400);

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
        return jsonError(OFFER_FORM_MESSAGES.duplicateActive, 409);
      }
    }

    await prisma.crossSellOffer.create({
      data: {
        storeId: store.id,
        suggestedProductId: input.suggestedProductId,
        suggestedProductName: suggestedProduct.name,
        isActive: input.isActive,
        triggers: {
          create: {
            triggerProductId: input.triggerProductId,
            triggerProductName: triggerProduct.name,
          },
        },
      },
    });

    return NextResponse.redirect(new URL("/admin/ofertas?created=1", getRequestOrigin(request)), { status: 303 });
  } catch (error) {
    console.warn("Cross-sell offer creation failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });

    return jsonError(OFFER_FORM_MESSAGES.saveFailed, 500);
  }
}

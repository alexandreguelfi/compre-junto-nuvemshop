import { NextResponse } from "next/server";

import { getCommercialStatus } from "@/src/lib/billing/commercial-status";
import { prisma } from "@/src/lib/prisma";
import { getConnectedStore } from "@/src/lib/stores/current-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OfferRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type OfferFormInput = {
  isActive: boolean | null;
  suggestedProductId: string;
  suggestedProductName: string;
  triggerProductId: string;
  triggerProductName: string;
};

const OFFER_FORM_MESSAGES = {
  duplicateActive:
    "Este produto principal ja tem uma oferta ativa. Desative a oferta existente ou salve esta como inativa.",
  invalidFormData: "Dados da oferta invalidos.",
  missingFields: "Preencha todos os itens obrigatorios para salvar a oferta.",
  missingStore: "Loja conectada nao encontrada.",
  missingSuggestedName: "Informe o nome do produto sugerido para continuar.",
  missingSuggestedProduct: "Selecione o produto sugerido para continuar.",
  missingTriggerName: "Informe o nome do produto principal para continuar.",
  missingTriggerProduct: "Selecione o produto principal para continuar.",
  notFound: "Oferta nao encontrada.",
  sameProduct: "Escolha produtos diferentes para criar uma oferta Compre Junto.",
  saveFailed: "Nao foi possivel atualizar a oferta agora.",
};

function readTextField(formData: FormData, fieldName: string): string {
  const value = formData.get(fieldName);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function parseOfferForm(formData: FormData): OfferFormInput {
  const statusValue = formData.get("isActive");

  return {
    suggestedProductId: readTextField(formData, "suggestedProductId"),
    suggestedProductName: readTextField(formData, "suggestedProductName"),
    triggerProductId: readTextField(formData, "triggerProductId"),
    triggerProductName: readTextField(formData, "triggerProductName"),
    isActive: typeof statusValue === "string" ? statusValue !== "false" : null,
  };
}

function hasOfferFields(input: OfferFormInput) {
  return Boolean(
    input.suggestedProductId ||
      input.suggestedProductName ||
      input.triggerProductId ||
      input.triggerProductName,
  );
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

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function PATCH(request: Request, context: OfferRouteContext) {
  const store = await getConnectedStore();

  if (!store?.id) {
    return jsonError(OFFER_FORM_MESSAGES.missingStore, 401);
  }

  const commercialAccess = await getCommercialStatus(store.id);

  if (!commercialAccess?.canCreateOffer) {
    return jsonError(commercialAccess?.message ?? "Acesso comercial nao liberado.", 403);
  }

  const { id } = await context.params;
  let input: OfferFormInput;

  try {
    input = parseOfferForm(await request.formData());
  } catch (error) {
    console.warn("Cross-sell offer update form parsing failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });

    return jsonError(OFFER_FORM_MESSAGES.invalidFormData, 400);
  }

  const updatesOfferFields = hasOfferFields(input);

  if (!updatesOfferFields && input.isActive === null) {
    return jsonError(OFFER_FORM_MESSAGES.invalidFormData, 400);
  }

  if (updatesOfferFields) {
    const validationError = getValidationError(input);

    if (validationError) {
      return jsonError(validationError, 400);
    }
  }

  try {
    const currentOffer = await prisma.crossSellOffer.findFirst({
      where: {
        id,
        storeId: store.id,
      },
      select: {
        id: true,
        isActive: true,
        triggers: {
          select: {
            triggerProductId: true,
            triggerProductName: true,
          },
        },
      },
    });

    if (!currentOffer) {
      return jsonError(OFFER_FORM_MESSAGES.notFound, 404);
    }

    const nextIsActive = input.isActive ?? currentOffer.isActive;
    const nextTriggerProductId = updatesOfferFields
      ? input.triggerProductId
      : currentOffer.triggers[0]?.triggerProductId;

    if (nextIsActive && nextTriggerProductId) {
      const duplicateOffer = await prisma.crossSellOffer.findFirst({
        where: {
          id: {
            not: currentOffer.id,
          },
          storeId: store.id,
          isActive: true,
          triggers: {
            some: {
              triggerProductId: nextTriggerProductId,
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

    if (updatesOfferFields) {
      await prisma.crossSellOffer.update({
        where: {
          id: currentOffer.id,
        },
        data: {
          isActive: nextIsActive,
          suggestedProductId: input.suggestedProductId,
          suggestedProductName: input.suggestedProductName,
          triggers: {
            deleteMany: {},
            create: {
              triggerProductId: input.triggerProductId,
              triggerProductName: input.triggerProductName,
            },
          },
        },
      });
    } else {
      await prisma.crossSellOffer.update({
        where: {
          id: currentOffer.id,
        },
        data: {
          isActive: nextIsActive,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      redirect: "/admin/ofertas?updated=1",
    });
  } catch (error) {
    console.warn("Cross-sell offer update failed.", {
      name: error instanceof Error ? error.name : "unknown",
    });

    return jsonError(OFFER_FORM_MESSAGES.saveFailed, 500);
  }
}

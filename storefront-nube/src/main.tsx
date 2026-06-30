/** @jsxImportSource @tiendanube/nube-sdk-jsx */

import { Box, Button, Text } from "@tiendanube/nube-sdk-jsx";
import { EVENT, STOREFRONT_UI_SLOT, type NubeSDK, type NubeSDKState } from "@tiendanube/nube-sdk-types";

const APP_ORIGIN = "https://compre-junto-nuvemshop-production.up.railway.app";
const WIDGET_SLOT = STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_ADD_TO_CART;
const PREVIOUS_DIAGNOSTIC_SLOT = STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_PRICE;

type ProductContext = {
  pageType: string;
  productId: string | null;
  storeId: string | null;
};

type PublicOffer = {
  principalProductId: string;
  suggestedProduct: {
    id: string;
    name: string;
    path: string | null;
    url: string | null;
  };
};

type PublicOfferResponse = {
  offer?: PublicOffer | null;
};

function logDiagnostic(message: string, details: Record<string, unknown> = {}) {
  console.info(`Compre Junto NubeSDK: ${message}`, details);
}

function cleanId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
}

function readProductContext(state: Readonly<NubeSDKState>): ProductContext {
  const page = state.location.page;
  const pageType = page.type;
  const storeId = cleanId(state.store.id);

  if (page.type !== "product") {
    return {
      pageType,
      productId: null,
      storeId,
    };
  }

  return {
    pageType,
    productId: cleanId(page.data.product.id),
    storeId,
  };
}

function buildOfferUrl(productId: string, storeId: string) {
  const url = new URL("/api/public/offers", APP_ORIGIN);

  url.searchParams.set("productId", productId);
  url.searchParams.set("storeId", storeId);

  return url.toString();
}

function readOfferPayload(payload: unknown): PublicOffer | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const offer = (payload as PublicOfferResponse).offer;

  if (!offer?.suggestedProduct?.id || !offer.suggestedProduct.name) {
    return null;
  }

  return {
    principalProductId: String(offer.principalProductId),
    suggestedProduct: {
      id: String(offer.suggestedProduct.id),
      name: offer.suggestedProduct.name,
      path:
        typeof offer.suggestedProduct.path === "string" && offer.suggestedProduct.path.startsWith("/")
          ? offer.suggestedProduct.path
          : null,
      url: typeof offer.suggestedProduct.url === "string" ? offer.suggestedProduct.url : null,
    },
  };
}

async function loadOffer(productId: string, storeId: string) {
  const endpoint = buildOfferUrl(productId, storeId);

  logDiagnostic("endpoint chamado", {
    endpoint,
    productId,
    storeId,
  });

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      logDiagnostic("erro de fetch", {
        status: response.status,
      });
      return null;
    }

    const offer = readOfferPayload(await response.json());

    logDiagnostic(offer ? "offer encontrada" : "offer null", {
      hasOffer: Boolean(offer),
      productId,
      storeId,
      suggestedProductId: offer?.suggestedProduct.id ?? null,
    });

    return offer;
  } catch (error) {
    logDiagnostic("erro capturado", {
      name: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

function OfferBlock({ nube, offer }: { nube: NubeSDK; offer: PublicOffer }) {
  const suggestedPath = offer.suggestedProduct.path;

  return (
    <Box
      background="#ffffff"
      borderRadius="8px"
      direction="col"
      gap="8px"
      padding="16px"
      style={{
        borderColor: "#e5e7eb",
        borderStyle: "solid",
        borderWidth: "1px",
        margin: "16px 0",
      }}
    >
      <Text heading={2} style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
        Compre junto
      </Text>
      <Text color="#52525b" style={{ fontSize: "14px", margin: 0 }}>
        Combine este produto com:
      </Text>
      <Text style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>{offer.suggestedProduct.name}</Text>
      <Button
        ariaLabel="Ver produto sugerido"
        disabled={!suggestedPath}
        onClick={() => {
          if (suggestedPath) {
            nube.getBrowserAPIs().navigate(suggestedPath as `/${string}`);
          }
        }}
        variant="primary"
      >
        Ver produto sugerido
      </Button>
    </Box>
  );
}

export function App(nube: NubeSDK) {
  let renderSequence = 0;

  logDiagnostic("script iniciado", {
    mode: "dynamic-offer-render",
    slot: WIDGET_SLOT,
  });

  async function refresh(state = nube.getState()) {
    renderSequence += 1;
    const currentSequence = renderSequence;
    const context = readProductContext(state);

    logDiagnostic("pagina detectada", {
      pageType: context.pageType,
      productId: context.productId,
      slot: WIDGET_SLOT,
      storeId: context.storeId,
    });

    nube.clearSlot(PREVIOUS_DIAGNOSTIC_SLOT);

    if (context.pageType !== "product") {
      nube.clearSlot(WIDGET_SLOT);
      return;
    }

    if (!context.productId || !context.storeId) {
      logDiagnostic("contexto de produto incompleto", {
        hasProductId: Boolean(context.productId),
        hasStoreId: Boolean(context.storeId),
        pageType: context.pageType,
      });
      nube.clearSlot(WIDGET_SLOT);
      return;
    }

    const offer = await loadOffer(context.productId, context.storeId);

    if (currentSequence !== renderSequence) {
      logDiagnostic("renderizacao ignorada por estado mais recente", {
        productId: context.productId,
        storeId: context.storeId,
      });
      return;
    }

    if (!offer) {
      nube.clearSlot(WIDGET_SLOT);
      return;
    }

    nube.render(WIDGET_SLOT, <OfferBlock nube={nube} offer={offer} />);
  }

  void refresh();
  nube.on(EVENT.PAGE_LOADED, (state) => {
    void refresh(state);
  });
  nube.on(EVENT.LOCATION_UPDATED, (state) => {
    void refresh(state);
  });
}

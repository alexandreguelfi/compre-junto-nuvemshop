/** @jsxImportSource @tiendanube/nube-sdk-jsx */

import { Box, Button, Text } from "@tiendanube/nube-sdk-jsx";
import { EVENT, STOREFRONT_UI_SLOT, type NubeSDK, type NubeSDKState } from "@tiendanube/nube-sdk-types";

const APP_ORIGIN = "https://compre-junto-nuvemshop-production.up.railway.app";
const WIDGET_SLOT = STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_ADD_TO_CART;

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
  offer: PublicOffer | null;
};

function getProductContext(state: Readonly<NubeSDKState>) {
  const page = state.location.page;

  if (page.type !== "product") {
    return null;
  }

  return {
    productId: String(page.data.product.id),
    storeId: String(state.store.id),
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

  const offer = (payload as Partial<PublicOfferResponse>).offer;

  if (!offer?.suggestedProduct?.id || !offer.suggestedProduct.name) {
    return null;
  }

  return {
    principalProductId: String(offer.principalProductId),
    suggestedProduct: {
      id: String(offer.suggestedProduct.id),
      name: offer.suggestedProduct.name,
      path: offer.suggestedProduct.path && offer.suggestedProduct.path.startsWith("/") ? offer.suggestedProduct.path : null,
      url: offer.suggestedProduct.url ?? null,
    },
  };
}

async function loadOffer(state: Readonly<NubeSDKState>) {
  const context = getProductContext(state);

  if (!context) {
    return null;
  }

  try {
    const response = await fetch(buildOfferUrl(context.productId, context.storeId), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return readOfferPayload(await response.json());
  } catch {
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

  async function refresh(state = nube.getState()) {
    renderSequence += 1;
    const currentSequence = renderSequence;

    if (!getProductContext(state)) {
      nube.clearSlot(WIDGET_SLOT);
      return;
    }

    const offer = await loadOffer(state);

    if (currentSequence !== renderSequence) {
      return;
    }

    if (!offer) {
      nube.clearSlot(WIDGET_SLOT);
      return;
    }

    nube.render(WIDGET_SLOT, <OfferBlock nube={nube} offer={offer} />);
  }

  void refresh();
  nube.on(EVENT.LOCATION_UPDATED, (state) => {
    void refresh(state);
  });
}

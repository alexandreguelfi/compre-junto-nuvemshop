/** @jsxImportSource @tiendanube/nube-sdk-jsx */

import { Box, Button, Text } from "@tiendanube/nube-sdk-jsx";
import { EVENT, STOREFRONT_UI_SLOT, type NubeSDK, type NubeSDKState } from "@tiendanube/nube-sdk-types";

const APP_ORIGIN = "https://compre-junto-nuvemshop-production.up.railway.app";
const PRIMARY_SLOT = STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_ADD_TO_CART;
const DIAGNOSTIC_SLOTS = [
  PRIMARY_SLOT,
  STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_PRICE,
  STOREFRONT_UI_SLOT.BEFORE_PRODUCT_DETAIL_ADD_TO_CART,
] as const;

type ProductContext = {
  endpoint: string | null;
  missingFields: string[];
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

type DiagnosticSnapshot = ProductContext & {
  error: string | null;
  offer: PublicOffer | null;
  status: "aguardando" | "offer encontrada" | "offer null" | "erro";
};

function logDiagnostic(message: string, details: Record<string, unknown> = {}) {
  console.info(`Compre Junto NubeSDK diagnóstico: ${message}`, details);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
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

function buildOfferUrl(productId: string, storeId: string) {
  const url = new URL("/api/public/offers", APP_ORIGIN);

  url.searchParams.set("productId", productId);
  url.searchParams.set("storeId", storeId);

  return url.toString();
}

function readProductContext(state: Readonly<NubeSDKState>): ProductContext {
  const stateRecord = asRecord(state);
  const locationRecord = asRecord(stateRecord?.location);
  const pageRecord = asRecord(locationRecord?.page);
  const pageType = typeof pageRecord?.type === "string" ? pageRecord.type : "desconhecido";
  const pageData = asRecord(pageRecord?.data);
  const productRecord = asRecord(pageData?.product);

  const productId =
    pageType === "product"
      ? cleanId(productRecord?.id ?? pageData?.product_id ?? pageData?.id)
      : null;
  const storeId = cleanId(asRecord(stateRecord?.store)?.id);
  const missingFields: string[] = [];

  if (pageType !== "product") {
    missingFields.push("pagina de produto");
  }

  if (!productId) {
    missingFields.push("productId");
  }

  if (!storeId) {
    missingFields.push("storeId");
  }

  return {
    endpoint: productId && storeId ? buildOfferUrl(productId, storeId) : null,
    missingFields,
    pageType,
    productId,
    storeId,
  };
}

function readOfferPayload(payload: unknown): PublicOffer | null {
  const payloadRecord = asRecord(payload);
  const offerRecord = asRecord(payloadRecord?.offer);
  const suggestedProductRecord = asRecord(offerRecord?.suggestedProduct);
  const suggestedProductId = cleanId(suggestedProductRecord?.id);
  const suggestedProductName = suggestedProductRecord?.name;

  if (
    !offerRecord ||
    !suggestedProductRecord ||
    !suggestedProductId ||
    typeof suggestedProductName !== "string" ||
    !suggestedProductName.trim()
  ) {
    return null;
  }

  const suggestedPath = suggestedProductRecord.path;
  const suggestedUrl = suggestedProductRecord.url;

  return {
    principalProductId: cleanId(offerRecord.principalProductId) ?? "",
    suggestedProduct: {
      id: suggestedProductId,
      name: suggestedProductName,
      path: typeof suggestedPath === "string" && suggestedPath.startsWith("/") ? suggestedPath : null,
      url: typeof suggestedUrl === "string" && suggestedUrl.trim() ? suggestedUrl : null,
    },
  };
}

function readStateSnapshot(nube: NubeSDK): DiagnosticSnapshot {
  try {
    const context = readProductContext(nube.getState());

    return {
      ...context,
      error: null,
      offer: null,
      status: "aguardando",
    };
  } catch (error) {
    return {
      endpoint: null,
      error: error instanceof Error ? error.name : "erro desconhecido",
      missingFields: ["state"],
      offer: null,
      pageType: "erro ao ler state",
      productId: null,
      status: "erro",
      storeId: null,
    };
  }
}

async function loadOffer(endpoint: string): Promise<{ error: string | null; offer: PublicOffer | null }> {
  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        error: `HTTP ${response.status}`,
        offer: null,
      };
    }

    return {
      error: null,
      offer: readOfferPayload(await response.json()),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.name : "erro de fetch",
      offer: null,
    };
  }
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <Text color="#3f3f46" style={{ fontSize: "12px", margin: 0 }}>
      {label}: {value}
    </Text>
  );
}

function OfferWidget({
  offer,
  onNavigate,
}: {
  offer: PublicOffer;
  onNavigate: (() => void) | null;
}) {
  return (
    <Box
      background="#ffffff"
      borderRadius="8px"
      direction="col"
      gap="8px"
      padding="14px"
      style={{
        borderColor: "#d9f99d",
        borderStyle: "solid",
        borderWidth: "1px",
        marginTop: "12px",
      }}
    >
      <Text heading={2} style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}>
        Compre junto
      </Text>
      <Text color="#52525b" style={{ fontSize: "14px", margin: 0 }}>
        Combine este produto com:
      </Text>
      <Text style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>{offer.suggestedProduct.name}</Text>
      <Button ariaLabel="Ver produto sugerido" disabled={!onNavigate} onClick={() => onNavigate?.()} variant="primary">
        Ver produto sugerido
      </Button>
    </Box>
  );
}

function OfferWidgetStatus({
  offer,
  onNavigate,
}: {
  offer: PublicOffer | null;
  onNavigate: (() => void) | null;
}) {
  if (!offer) {
    return <DiagnosticRow label="widget real" value="nao renderizado sem oferta" />;
  }

  return <OfferWidget offer={offer} onNavigate={onNavigate} />;
}

function DiagnosticBlock({
  onNavigate,
  showOffer,
  slot,
  snapshot,
}: {
  onNavigate: (() => void) | null;
  showOffer: boolean;
  slot: string;
  snapshot: DiagnosticSnapshot;
}) {
  return (
    <Box
      background="#fffef2"
      borderRadius="8px"
      direction="col"
      gap="6px"
      padding="14px"
      style={{
        borderColor: "#facc15",
        borderStyle: "solid",
        borderWidth: "1px",
        margin: "12px 0",
      }}
    >
      <Text heading={2} style={{ fontSize: "17px", fontWeight: 700, margin: 0 }}>
        Compre Junto NubeSDK diagnóstico
      </Text>
      <DiagnosticRow label="slot" value={slot} />
      <DiagnosticRow label="pageType" value={snapshot.pageType} />
      <DiagnosticRow label="productId" value={snapshot.productId ?? "ausente"} />
      <DiagnosticRow label="storeId" value={snapshot.storeId ?? "ausente"} />
      <DiagnosticRow label="endpoint" value={snapshot.endpoint ?? "nao chamado"} />
      <DiagnosticRow label="status da oferta" value={snapshot.status} />
      <DiagnosticRow
        label="campos ausentes"
        value={snapshot.missingFields.length ? snapshot.missingFields.join(", ") : "nenhum"}
      />
      <DiagnosticRow label="erro" value={snapshot.error ?? "nenhum"} />
      <DiagnosticRow
        label="produto sugerido"
        value={
          snapshot.offer
            ? `${snapshot.offer.suggestedProduct.name} (${snapshot.offer.suggestedProduct.id})`
            : "ausente"
        }
      />
      {showOffer ? (
        <OfferWidgetStatus offer={snapshot.offer} onNavigate={onNavigate} />
      ) : (
        <DiagnosticRow label="widget real" value="apenas no slot principal" />
      )}
    </Box>
  );
}

function renderDiagnostics(nube: NubeSDK, snapshot: DiagnosticSnapshot) {
  const suggestedPath = snapshot.offer?.suggestedProduct.path;
  const onNavigate =
    suggestedPath && suggestedPath.startsWith("/")
      ? () => {
          nube.getBrowserAPIs().navigate(suggestedPath as `/${string}`);
        }
      : null;

  for (const slot of DIAGNOSTIC_SLOTS) {
    nube.render(slot, (
      <DiagnosticBlock
        onNavigate={slot === PRIMARY_SLOT ? onNavigate : null}
        showOffer={slot === PRIMARY_SLOT}
        slot={slot}
        snapshot={snapshot}
      />
    ));
  }
}

export function App(nube: NubeSDK) {
  let renderSequence = 0;

  logDiagnostic("script iniciado", {
    mode: "dynamic-visible-diagnostic",
    slots: DIAGNOSTIC_SLOTS,
  });

  async function refresh(state?: Readonly<NubeSDKState>) {
    renderSequence += 1;
    const currentSequence = renderSequence;
    const initialSnapshot = state
      ? {
          ...readProductContext(state),
          error: null,
          offer: null,
          status: "aguardando" as const,
        }
      : readStateSnapshot(nube);

    logDiagnostic("state lido", {
      endpoint: initialSnapshot.endpoint,
      missingFields: initialSnapshot.missingFields,
      pageType: initialSnapshot.pageType,
      productId: initialSnapshot.productId,
      storeId: initialSnapshot.storeId,
    });

    renderDiagnostics(nube, initialSnapshot);

    if (!initialSnapshot.endpoint || initialSnapshot.missingFields.length) {
      logDiagnostic("fetch nao chamado", {
        missingFields: initialSnapshot.missingFields,
      });
      return;
    }

    logDiagnostic("endpoint chamado", {
      endpoint: initialSnapshot.endpoint,
      productId: initialSnapshot.productId,
      storeId: initialSnapshot.storeId,
    });

    const result = await loadOffer(initialSnapshot.endpoint);

    if (currentSequence !== renderSequence) {
      logDiagnostic("resultado ignorado por state mais recente", {
        endpoint: initialSnapshot.endpoint,
      });
      return;
    }

    const finalSnapshot: DiagnosticSnapshot = {
      ...initialSnapshot,
      error: result.error,
      offer: result.offer,
      status: result.error ? "erro" : result.offer ? "offer encontrada" : "offer null",
    };

    logDiagnostic("resultado de oferta", {
      hasOffer: Boolean(finalSnapshot.offer),
      status: finalSnapshot.status,
      suggestedProductId: finalSnapshot.offer?.suggestedProduct.id ?? null,
    });

    renderDiagnostics(nube, finalSnapshot);
  }

  void refresh();
  nube.on(EVENT.PAGE_LOADED, (state) => {
    void refresh(state);
  });
  nube.on(EVENT.LOCATION_UPDATED, (state) => {
    void refresh(state);
  });
}

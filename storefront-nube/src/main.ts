import type { NubeComponent, NubeSDK, NubeSDKState, ProductDetails, ProductVariant } from "@tiendanube/nube-sdk-types";

const BLOCK_ID = "compre-junto-widget-root";
const DIAGNOSTIC_BLOCK_ID = "compre-junto-widget-diagnostic";
const TARGET_SLOT = "after_product_detail_add_to_cart";
const FALLBACK_DELAY_MS = 1200;
const APP_ORIGIN = "https://compre-junto-nuvemshop-production.up.railway.app";
const PUBLIC_OFFERS_URL = `${APP_ORIGIN}/api/public/offers`;
const STOREFRONT_EVENTS_URL = `${APP_ORIGIN}/api/public/storefront-events`;
const RENDER_LOCK_PREFIX = "compre-junto:render-lock:";
const RENDER_LEASE_MAX_AGE_MS = 5000;
const RENDER_LEASE_HEARTBEAT_MS = 1500;
const CART_ADD_TIMEOUT_MS = 8000;
// This browser-local cache is the first deduplication layer. It is shared by bundle instances,
// includes no credentials, and keeps valid responses for one minute and failures for ten seconds.
const OFFER_REQUEST_TTL_MS = 60_000;
const OFFER_FAILURE_TTL_MS = 10_000;
const MAX_OFFER_REQUEST_ENTRIES = 100;

const DEBUG_QUERY_KEYS = ["cj_debug", "compre_junto_debug", "nubesdk_debug"] as const;

type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleCallbackOptions = {
  timeout?: number;
};

type IdleCallback = (callback: (deadline: IdleDeadline) => void, options?: IdleCallbackOptions) => unknown;

type BrowserGlobals = typeof globalThis & {
  __compreJuntoNubeRequests?: OfferRequestState;
  location?: Location;
  requestIdleCallback?: IdleCallback;
};

type OfferRequestEntry = {
  expiresAt: number;
  response: PublicOfferResponse;
};

type OfferRequestState = {
  entries: Map<string, OfferRequestEntry>;
  inFlight: Map<string, Promise<OfferFetchResult>>;
};

type OfferFetchResult = {
  response: PublicOfferResponse;
  ttlMs: number;
};

type Money = {
  amount: number | null;
  label: string | null;
};

type ProductCardData = {
  compareAtPrice: Money;
  imageUrl: string | null;
  name: string;
  price: Money;
  productId: string;
  url: string | null;
  variantId: string | null;
};

type ProductContext = {
  currencyCode: string;
  currencySymbol: string;
  language: string;
  mainProduct: ProductCardData;
  storeId: string;
};

type PublicOfferResponse = {
  diagnostic?: {
    code?: string;
    productDetected?: boolean;
    scriptLoaded?: boolean;
    storeDetected?: boolean;
  };
  offer?: {
    principalProductId?: string;
    suggestedProduct?: {
      compareAtPrice?: string | null;
      id?: string | null;
      imageUrl?: string | null;
      name?: string | null;
      path?: string | null;
      price?: string | null;
      promotionalPrice?: string | null;
      url?: string | null;
      variantId?: string | null;
    } | null;
  } | null;
};

type BundleCartItemPayload = {
  product_id: number;
  quantity: number;
  variant_id: number;
};

type CartItemExpectation = BundleCartItemPayload;

type ActiveOffer = {
  context: ProductContext;
  suggestedProduct: ProductCardData;
};

type CartAddStatus = "idle" | "loading" | "success" | "error";

let warningLogged = false;
let cartListenersRegistered = false;
let variantListenerRegistered = false;
let activeOffer: ActiveOffer | null = null;
let cartAddStatus: CartAddStatus = "idle";
let cartStatusMessage: string | null = null;
let cartAddTimeout: ReturnType<typeof setTimeout> | undefined;
let pendingCartItems: CartItemExpectation[] | null = null;
let currentContextKey = "";
let pendingContextKey = "";
let requestVersion = 0;
let renderLeaseTimer: ReturnType<typeof setInterval> | undefined;

function getBrowserGlobals() {
  return globalThis as unknown as BrowserGlobals;
}

function getOfferRequestState() {
  const globals = getBrowserGlobals();
  if (!globals.__compreJuntoNubeRequests) {
    globals.__compreJuntoNubeRequests = { entries: new Map(), inFlight: new Map() };
  }
  return globals.__compreJuntoNubeRequests;
}

function component(value: Record<string, unknown>): NubeComponent {
  return value as NubeComponent;
}

function box(props: Record<string, unknown>) {
  return component({ type: "box", ...props });
}

function image(props: Record<string, unknown>) {
  return component({ type: "img", ...props });
}

function button(props: Record<string, unknown>) {
  return component({ type: "button", ...props });
}

function link(props: Record<string, unknown>) {
  return component({ type: "link", ...props });
}

function text(props: Record<string, unknown>) {
  return component({ type: "txt", ...props });
}

function logWarningOnce(reason: string, details: Record<string, string | number | boolean | null> = {}) {
  if (warningLogged) {
    return;
  }

  warningLogged = true;
  console.warn("Compre Junto NubeSDK", { reason, ...details });
}

function readLocalizedValue(value: unknown, language = "pt"): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const localized = value as Record<string, unknown>;
  const preferred = localized[language] ?? localized["pt-BR"] ?? localized.pt ?? localized.en;

  if (typeof preferred === "string" && preferred.trim()) {
    return preferred.trim();
  }

  for (const item of Object.values(localized)) {
    if (typeof item === "string" && item.trim()) {
      return item.trim();
    }
  }

  return null;
}

function parseMoney(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

function formatMoney(amount: number | null, context: Pick<ProductContext, "currencyCode" | "currencySymbol" | "language">) {
  if (amount === null) {
    return null;
  }

  try {
    return new Intl.NumberFormat(context.language || "pt-BR", {
      currency: context.currencyCode || "BRL",
      style: "currency",
    }).format(amount);
  } catch {
    return `${context.currencySymbol || "R$"} ${amount.toFixed(2).replace(".", ",")}`;
  }
}

function moneyFromValue(
  value: string | null | undefined,
  context: Pick<ProductContext, "currencyCode" | "currencySymbol" | "language">,
): Money {
  const amount = parseMoney(value ?? null);

  return {
    amount,
    label: formatMoney(amount, context),
  };
}

function getEffectiveVariantPrice(variant: ProductVariant | null | undefined) {
  return variant?.promotional_price || variant?.price || null;
}

function getCompareAtVariantPrice(variant: ProductVariant | null | undefined) {
  return variant?.compare_at_price || null;
}

function getAvailableVariant(product: ProductDetails): ProductVariant | null {
  const variants = Array.isArray(product.variants) ? product.variants : [];

  return (
    variants.find((variant) => {
      if (!variant.stock_management) {
        return true;
      }

      return variant.stock === null || variant.stock > 0;
    }) ?? null
  );
}

function getPrimaryImageUrl(product: ProductDetails) {
  return product.images?.[0]?.src ?? null;
}

function normalizeHref(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  if (url.startsWith("/")) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}` || url;
  } catch {
    return url;
  }
}

function parsePositiveInteger(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function readProductContext(nube: NubeSDK): ProductContext | null {
  try {
    const state = nube.getState();
    const page = state.location.page;

    if (page.type !== "product") {
      return null;
    }

    const product = page.data.product;
    const language = state.store.language || "pt-BR";
    const currencyDetails = state.store.currency_details;
    const variant = getAvailableVariant(product);
    const baseContext = {
      currencyCode: currencyDetails?.code || state.store.currency || "BRL",
      currencySymbol: currencyDetails?.display_short || "R$",
      language,
    };

    const storeId = state.store.id ? String(state.store.id) : "";

    if (!storeId) {
      return null;
    }

    return {
      ...baseContext,
      mainProduct: {
        compareAtPrice: moneyFromValue(getCompareAtVariantPrice(variant), baseContext),
        imageUrl: getPrimaryImageUrl(product),
        name: readLocalizedValue(product.name, language) ?? `Produto ${product.id}`,
        price: moneyFromValue(getEffectiveVariantPrice(variant), baseContext),
        productId: String(product.id),
        url: product.canonical_url || null,
        variantId: variant?.id ? String(variant.id) : null,
      },
      storeId,
    };
  } catch {
    return null;
  }
}

function isDiagnosticModeRequested(nube?: NubeSDK) {
  try {
    const stateQueries = nube?.getState().location.queries ?? {};

    if (DEBUG_QUERY_KEYS.some((key) => stateQueries[key] === "1" || stateQueries[key] === "true")) {
      return true;
    }
  } catch {
    // Continue with browser checks below.
  }

  try {
    const location = getBrowserGlobals().location;

    if (!location) {
      return false;
    }

    const params = new URLSearchParams(location.search);
    const hasDebugParam = DEBUG_QUERY_KEYS.some((key) => params.get(key) === "1" || params.get(key) === "true");
    return hasDebugParam;
  } catch {
    return false;
  }
}

function hasRenderedBlock(nube?: NubeSDK) {
  try {
    const slot = nube?.getState().ui.slots[TARGET_SLOT];
    const blocks = Array.isArray(slot) ? slot : slot ? [slot] : [];

    return blocks.some((block) => typeof block === "object" && block !== null && "id" in block && block.id === BLOCK_ID);
  } catch {
    return Boolean(currentContextKey);
  }
}

function createDiagnosticBlock(reason: string): NubeComponent {
  return box({
    background: "#ffffff",
    borderRadius: "8px",
    direction: "col",
    gap: "6px",
    id: DIAGNOSTIC_BLOCK_ID,
    padding: "14px",
    style: {
      borderColor: "#d4d4d8",
      borderStyle: "solid",
      borderWidth: "1px",
      margin: "14px 0",
    },
    children: [
      text({
        children: "Compre Junto NubeSDK em modo diagnostico",
        heading: 2,
        style: {
          fontSize: "15px",
          fontWeight: 700,
          margin: 0,
        },
      }),
      text({
        children: reason,
        color: "#71717a",
        style: {
          fontSize: "13px",
          margin: 0,
        },
      }),
    ],
  });
}

function createProductLine(label: string, product: ProductCardData): NubeComponent {
  const children: NubeComponent[] = [];

  if (product.imageUrl) {
    children.push(
      image({
        alt: product.name,
        height: 56,
        src: product.imageUrl,
        style: {
          borderRadius: "6px",
          objectFit: "cover",
        },
        width: 56,
      }),
    );
  }

  children.push(
    box({
      direction: "col",
      gap: "3px",
      style: {
        flex: 1,
        minWidth: 0,
      },
      children: [
        text({
          children: label,
          color: "#71717a",
          style: {
            fontSize: "12px",
            margin: 0,
          },
        }),
        text({
          children: product.name,
          style: {
            fontSize: "14px",
            fontWeight: 700,
            margin: 0,
          },
        }),
        text({
          children: product.price.label ?? "Preco indisponivel",
          color: "#18181b",
          style: {
            fontSize: "13px",
            margin: 0,
          },
        }),
      ],
    }),
  );

  return box({
    alignItems: "center",
    direction: "row",
    gap: "10px",
    children,
  });
}

export function getBundleCartItems(context: ProductContext, suggestedProduct: ProductCardData): BundleCartItemPayload[] | null {
  const mainProductId = parsePositiveInteger(context.mainProduct.productId);
  const mainVariantId = parsePositiveInteger(context.mainProduct.variantId);
  const suggestedProductId = parsePositiveInteger(suggestedProduct.productId);
  const suggestedVariantId = parsePositiveInteger(suggestedProduct.variantId);

  if (!mainProductId || !mainVariantId || !suggestedProductId || !suggestedVariantId) {
    return null;
  }

  return [
    {
      product_id: mainProductId,
      quantity: 1,
      variant_id: mainVariantId,
    },
    {
      product_id: suggestedProductId,
      quantity: 1,
      variant_id: suggestedVariantId,
    },
  ];
}

function clearCartAddTimeout() {
  if (!cartAddTimeout) {
    return;
  }

  clearTimeout(cartAddTimeout);
  cartAddTimeout = undefined;
}

function getContextKey(context: ProductContext) {
  return `${context.storeId}:${context.mainProduct.productId}`;
}

async function reportStorefrontEvent(context: ProductContext, code: string) {
  try {
    await fetch(STOREFRONT_EVENTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        productId: context.mainProduct.productId,
        storeId: context.storeId,
        technology: "nubesdk",
      }),
    });
  } catch {
    // Diagnostics must never affect the storefront.
  }
}

export async function claimRenderLock(nube: NubeSDK, context: ProductContext) {
  try {
    const storage = nube.getBrowserAPIs().asyncSessionStorage;
    const key = `${RENDER_LOCK_PREFIX}${getContextKey(context)}`;
    const existing = await storage.getItem(key);
    if (!existing) return true;
    const lease = JSON.parse(existing) as { renderedAt?: unknown; technology?: unknown };
    return !(
      lease.technology === "legacy" &&
      typeof lease.renderedAt === "number" &&
      Date.now() - lease.renderedAt >= 0 &&
      Date.now() - lease.renderedAt < RENDER_LEASE_MAX_AGE_MS
    );
  } catch {
    return !hasRenderedBlock(nube);
  }
}

async function recordRenderLease(nube: NubeSDK, context: ProductContext) {
  try {
    const storage = nube.getBrowserAPIs().asyncSessionStorage;
    await storage.setItem(
      `${RENDER_LOCK_PREFIX}${getContextKey(context)}`,
      JSON.stringify({ renderedAt: Date.now(), technology: "nubesdk" }),
    );
  } catch {
    // The rendered slot remains the source of truth when storage is unavailable.
  }
}

function stopRenderLeaseHeartbeat() {
  if (renderLeaseTimer) clearInterval(renderLeaseTimer);
  renderLeaseTimer = undefined;
}

function startRenderLeaseHeartbeat(nube: NubeSDK, context: ProductContext) {
  stopRenderLeaseHeartbeat();
  void recordRenderLease(nube, context);
  renderLeaseTimer = setInterval(() => {
    if (currentContextKey === getContextKey(context) && hasRenderedBlock(nube)) void recordRenderLease(nube, context);
    else stopRenderLeaseHeartbeat();
  }, RENDER_LEASE_HEARTBEAT_MS);
}

function getCartItemQuantity(state: Readonly<NubeSDKState>, item: BundleCartItemPayload) {
  const cartItems = Array.isArray(state.cart.items) ? state.cart.items : [];

  return cartItems.reduce((quantity, cartItem) => {
    if (
      Number(cartItem.product_id) === item.product_id &&
      Number(cartItem.variant_id) === item.variant_id
    ) {
      return quantity + cartItem.quantity;
    }

    return quantity;
  }, 0);
}

function getCartItemExpectations(state: Readonly<NubeSDKState>, items: BundleCartItemPayload[]): CartItemExpectation[] {
  return items.map((item) => ({
    ...item,
    quantity: getCartItemQuantity(state, item) + item.quantity,
  }));
}

function cartContainsExpectedItems(state: Readonly<NubeSDKState>, items: CartItemExpectation[]) {
  return items.every((item) => getCartItemQuantity(state, item) >= item.quantity);
}

function renderActiveOffer(nube: NubeSDK) {
  if (!activeOffer) {
    return;
  }

  nube.render(TARGET_SLOT, createOfferBlock(nube, activeOffer.context, activeOffer.suggestedProduct));
}

function setCartStatus(nube: NubeSDK, status: CartAddStatus, message: string | null) {
  cartAddStatus = status;
  cartStatusMessage = message;
  renderActiveOffer(nube);
}

function handleCartAddTimeout(nube: NubeSDK) {
  if (cartAddStatus !== "loading") {
    return;
  }

  pendingCartItems = null;
  if (activeOffer) void reportStorefrontEvent(activeOffer.context, "cart_add_failed");
  setCartStatus(nube, "error", "Nao foi possivel confirmar o carrinho. Use o link abaixo para continuar.");
}

function addBundleToCart(
  nube: NubeSDK,
  context: ProductContext,
  suggestedProduct: ProductCardData,
  items: BundleCartItemPayload[],
) {
  if (cartAddStatus === "loading") {
    return;
  }

  clearCartAddTimeout();
  activeOffer = { context, suggestedProduct };

  try {
    pendingCartItems = getCartItemExpectations(nube.getState(), items);
  } catch {
    pendingCartItems = items;
  }

  cartAddStatus = "loading";
  cartStatusMessage = null;
  renderActiveOffer(nube);
  void reportStorefrontEvent(context, "cart_add_started");

  cartAddTimeout = setTimeout(() => handleCartAddTimeout(nube), CART_ADD_TIMEOUT_MS);

  try {
    nube.send("cart:add", () => ({
      cart: {
        items,
      },
    }));
  } catch {
    clearCartAddTimeout();
    pendingCartItems = null;
    void reportStorefrontEvent(context, "cart_add_failed");
    setCartStatus(nube, "error", "Nao foi possivel adicionar o conjunto. Use o link abaixo para continuar.");
  }
}

function registerCartListeners(nube: NubeSDK) {
  if (cartListenersRegistered) {
    return;
  }

  cartListenersRegistered = true;

  nube.on("cart:add:success", (state) => {
    if (cartAddStatus !== "loading" || !activeOffer) {
      return;
    }

    if (!pendingCartItems || !cartContainsExpectedItems(state, pendingCartItems)) {
      return;
    }

    clearCartAddTimeout();
    pendingCartItems = null;
    void reportStorefrontEvent(activeOffer.context, "cart_add_success");
    setCartStatus(nube, "success", "Conjunto adicionado ao carrinho.");
  });

  nube.on("cart:add:fail", () => {
    if (cartAddStatus !== "loading") {
      return;
    }

    clearCartAddTimeout();
    pendingCartItems = null;
    if (activeOffer) void reportStorefrontEvent(activeOffer.context, "cart_add_failed");
    setCartStatus(nube, "error", "Nao foi possivel adicionar o conjunto. Use o link abaixo para continuar.");
  });
}

function registerVariantListener(nube: NubeSDK) {
  if (variantListenerRegistered) return;
  variantListenerRegistered = true;

  nube.on("product:variant_selected", (state) => {
    if (!activeOffer) return;
    const payload = state.eventPayload;
    if (!payload || String(payload.product_id ?? "") !== activeOffer.context.mainProduct.productId) return;
    const variantId = parsePositiveInteger(String(payload.id ?? ""));
    const stockManaged = payload.stock_management === true;
    const stock = typeof payload.stock === "number" ? payload.stock : null;
    const available = !stockManaged || stock === null || stock > 0;
    const baseContext = activeOffer.context;
    const compareAtPrice =
      typeof payload.compare_at_price === "number" ? String(payload.compare_at_price) : payload.compare_at_price;
    const promotionalPrice =
      typeof payload.promotional_price === "number" ? String(payload.promotional_price) : payload.promotional_price;
    const price = typeof payload.price === "number" ? String(payload.price) : payload.price;
    const context: ProductContext = {
      ...baseContext,
      mainProduct: {
        ...baseContext.mainProduct,
        compareAtPrice: moneyFromValue(typeof compareAtPrice === "string" ? compareAtPrice : null, baseContext),
        price: moneyFromValue(
          typeof promotionalPrice === "string"
            ? promotionalPrice
            : typeof price === "string"
              ? price
              : null,
          baseContext,
        ),
        variantId: available && variantId ? String(variantId) : null,
      },
    };
    activeOffer = { ...activeOffer, context };
    cartAddStatus = "idle";
    cartStatusMessage = null;
    pendingCartItems = null;
    clearCartAddTimeout();
    renderActiveOffer(nube);
  });
}

function createCartActions(
  nube: NubeSDK,
  context: ProductContext,
  suggestedProduct: ProductCardData,
  cartItems: BundleCartItemPayload[] | null,
): NubeComponent[] {
  const children: NubeComponent[] = [];
  const canAddBundle = cartItems !== null;
  const suggestedHref = normalizeHref(suggestedProduct.url);

  if (canAddBundle) {
    const buttonLabel =
      cartAddStatus === "loading"
        ? "Adicionando..."
        : cartAddStatus === "success"
          ? "Conjunto adicionado"
          : cartAddStatus === "error"
            ? "Tentar adicionar conjunto"
            : "Adicionar conjunto ao carrinho";

    children.push(
      button({
        ariaLabel: buttonLabel,
        children: buttonLabel,
        disabled: cartAddStatus === "loading" || cartAddStatus === "success",
        onClick: () => addBundleToCart(nube, context, suggestedProduct, cartItems),
        variant: "primary",
        width: "100%",
        style: {
          marginTop: "4px",
        },
      }),
    );
  }

  if (cartStatusMessage) {
    children.push(
      text({
        children: cartStatusMessage,
        color: cartAddStatus === "success" ? "#15803d" : "#71717a",
        style: {
          fontSize: "12px",
          margin: 0,
        },
      }),
    );
  }

  if (suggestedHref) {
    children.push(
      link({
        children: "Ver produto recomendado",
        href: suggestedHref,
        variant: canAddBundle ? "secondary" : "primary",
        style: {
          marginTop: canAddBundle ? 0 : "4px",
        },
      }),
    );
  }

  return children;
}

function createOfferBlock(nube: NubeSDK, context: ProductContext, suggestedProduct: ProductCardData): NubeComponent {
  const cartItems = getBundleCartItems(context, suggestedProduct);
  const combinedAmount =
    context.mainProduct.price.amount !== null && suggestedProduct.price.amount !== null
      ? context.mainProduct.price.amount + suggestedProduct.price.amount
      : null;
  const compareAmount =
    (context.mainProduct.compareAtPrice.amount ?? context.mainProduct.price.amount ?? 0) +
    (suggestedProduct.compareAtPrice.amount ?? suggestedProduct.price.amount ?? 0);
  const savingsAmount = combinedAmount !== null && compareAmount > combinedAmount ? compareAmount - combinedAmount : null;
  const children: NubeComponent[] = [
    text({
      children: "Compre junto",
      heading: 2,
      style: {
        fontSize: "17px",
        fontWeight: 700,
        margin: 0,
      },
    }),
    createProductLine("Produto principal", context.mainProduct),
    text({
      children: "+",
      color: "#22c55e",
      style: {
        fontSize: "18px",
        fontWeight: 700,
        margin: 0,
        textAlign: "center",
      },
    }),
    createProductLine("Produto recomendado", suggestedProduct),
  ];

  if (combinedAmount !== null) {
    children.push(
      box({
        background: "#f4f4f5",
        borderRadius: "6px",
        direction: "col",
        gap: "4px",
        padding: "10px",
        children: [
          text({
            children: `Preco combinado: ${formatMoney(combinedAmount, context) ?? "indisponivel"}`,
            style: {
              fontSize: "14px",
              fontWeight: 700,
              margin: 0,
            },
          }),
          savingsAmount
            ? text({
                children: `Economia estimada: ${formatMoney(savingsAmount, context)}`,
                color: "#15803d",
                style: {
                  fontSize: "13px",
                  margin: 0,
                },
              })
            : text({
                children: "Desconto nao configurado para esta oferta.",
                color: "#71717a",
                style: {
                  fontSize: "12px",
                  margin: 0,
                },
              }),
        ],
      }),
    );
  }

  children.push(...createCartActions(nube, context, suggestedProduct, cartItems));

  return box({
    background: "#ffffff",
    borderRadius: "8px",
    direction: "col",
    gap: "12px",
    id: BLOCK_ID,
    padding: "14px",
    style: {
      borderColor: "#22c55e",
      borderStyle: "solid",
      borderWidth: "1px",
      margin: "14px 0",
    },
    children,
  });
}

export function normalizeSuggestedProduct(context: ProductContext, response: PublicOfferResponse): ProductCardData | null {
  if (response.offer?.principalProductId && response.offer.principalProductId !== context.mainProduct.productId) {
    return null;
  }
  const suggestedProduct = response.offer?.suggestedProduct;

  if (!suggestedProduct?.id || !suggestedProduct.name) {
    return null;
  }

  const priceValue = suggestedProduct.promotionalPrice || suggestedProduct.price || null;

  return {
    compareAtPrice: moneyFromValue(suggestedProduct.compareAtPrice ?? null, context),
    imageUrl: suggestedProduct.imageUrl ?? null,
    name: suggestedProduct.name,
    price: moneyFromValue(priceValue, context),
    productId: suggestedProduct.id,
    url: suggestedProduct.path ?? suggestedProduct.url ?? null,
    variantId: suggestedProduct.variantId ?? null,
  };
}

async function fetchOffer(nube: NubeSDK, context: ProductContext): Promise<PublicOfferResponse> {
  const contextKey = getContextKey(context);
  const debug = isDiagnosticModeRequested(nube) ? "&cj_debug=1" : "";
  const requestKey = `${contextKey}:${debug ? "debug" : "standard"}`;
  const url = `${PUBLIC_OFFERS_URL}?productId=${encodeURIComponent(context.mainProduct.productId)}&storeId=${encodeURIComponent(
    context.storeId,
  )}&technology=nubesdk${debug}`;
  const state = getOfferRequestState();
  const cached = state.entries.get(requestKey);
  if (cached && cached.expiresAt > Date.now()) {
    void reportStorefrontEvent(context, "offer_request_deduplicated");
    return cached.response;
  }
  if (cached) state.entries.delete(requestKey);

  const pending = state.inFlight.get(requestKey);
  if (pending) {
    void reportStorefrontEvent(context, "offer_request_deduplicated");
    return (await pending).response;
  }

  const request = (async () => {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        logWarningOnce("offer_lookup_failed", { status: response.status });
        return { response: { offer: null }, ttlMs: OFFER_FAILURE_TTL_MS };
      }
      try {
        return { response: (await response.json()) as PublicOfferResponse, ttlMs: OFFER_REQUEST_TTL_MS };
      } catch {
        logWarningOnce("offer_response_invalid");
        return { response: { offer: null }, ttlMs: OFFER_FAILURE_TTL_MS };
      }
    } catch {
      logWarningOnce("offer_lookup_failed");
      return { response: { offer: null }, ttlMs: OFFER_FAILURE_TTL_MS };
    }
  })();

  state.inFlight.set(requestKey, request);
  try {
    const result = await request;
    state.entries.set(requestKey, { expiresAt: Date.now() + result.ttlMs, response: result.response });
    for (const [key, entry] of state.entries) {
      if (entry.expiresAt <= Date.now() || state.entries.size > MAX_OFFER_REQUEST_ENTRIES) state.entries.delete(key);
      if (state.entries.size <= MAX_OFFER_REQUEST_ENTRIES) break;
    }
    return result.response;
  } finally {
    if (state.inFlight.get(requestKey) === request) state.inFlight.delete(requestKey);
  }
}

function renderDiagnostic(nube: NubeSDK, response: PublicOfferResponse) {
  if (!response.diagnostic) {
    return;
  }

  const diagnostic = response.diagnostic;
  nube.render(
    TARGET_SLOT,
    createDiagnosticBlock(
      `Script carregado; produto ${diagnostic.productDetected ? "detectado" : "nao detectado"}; loja ${
        diagnostic.storeDetected ? "detectada" : "nao detectada"
      }; resultado ${diagnostic.code ?? "indisponivel"}.`,
    ),
  );
}

async function renderDynamicWidget(nube: NubeSDK) {
  const context = readProductContext(nube);

  if (!context) {
    requestVersion += 1;
    pendingContextKey = "";
    if (currentContextKey) {
      nube.clearSlot(TARGET_SLOT);
      stopRenderLeaseHeartbeat();
      currentContextKey = "";
      activeOffer = null;
    }
    return;
  }

  const contextKey = getContextKey(context);
  if (pendingContextKey === contextKey || (currentContextKey === contextKey && hasRenderedBlock(nube))) return;

  if (currentContextKey && currentContextKey !== contextKey) {
    nube.clearSlot(TARGET_SLOT);
    stopRenderLeaseHeartbeat();
    currentContextKey = "";
    activeOffer = null;
    cartAddStatus = "idle";
    cartStatusMessage = null;
    pendingCartItems = null;
    clearCartAddTimeout();
  }

  pendingContextKey = contextKey;
  const version = ++requestVersion;

  try {
    if (!(await claimRenderLock(nube, context))) {
      pendingContextKey = "";
      void reportStorefrontEvent(context, "widget_already_rendered");
      return;
    }

    await recordRenderLease(nube, context);
    const offerResponse = await fetchOffer(nube, context);
    const latestContext = readProductContext(nube);

    if (version !== requestVersion || !latestContext || getContextKey(latestContext) !== contextKey) return;
    const suggestedProduct = normalizeSuggestedProduct(context, offerResponse);

    if (!suggestedProduct) {
      pendingContextKey = "";
      renderDiagnostic(nube, offerResponse);
      return;
    }

    activeOffer = { context, suggestedProduct };
    cartAddStatus = "idle";
    cartStatusMessage = null;
    pendingCartItems = null;
    clearCartAddTimeout();
    registerCartListeners(nube);
    registerVariantListener(nube);
    nube.render(TARGET_SLOT, createOfferBlock(nube, context, suggestedProduct));
    if (!hasRenderedBlock(nube)) throw new Error("NubeSDK did not confirm the rendered block.");
    currentContextKey = contextKey;
    pendingContextKey = "";
    startRenderLeaseHeartbeat(nube, context);
    void reportStorefrontEvent(context, "widget_rendered");
  } catch {
    pendingContextKey = "";
    activeOffer = null;
    cartAddStatus = "idle";
    cartStatusMessage = null;
    pendingCartItems = null;
    clearCartAddTimeout();
    logWarningOnce("dynamic_render_failed");
  }
}

function scheduleAfterCriticalPaint(render: () => void) {
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let completed = false;

  const run = () => {
    if (completed) return;
    completed = true;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
    }

    render();
  };

  fallbackTimer = setTimeout(run, FALLBACK_DELAY_MS);

  try {
    const requestIdleCallback = getBrowserGlobals().requestIdleCallback;

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: FALLBACK_DELAY_MS });
    }
  } catch {
    return;
  }
}

export function App(nube: NubeSDK) {
  nube.on("page:loaded", () => {
    void renderDynamicWidget(nube);
  });
  nube.on("location:updated", () => {
    void renderDynamicWidget(nube);
  });
  scheduleAfterCriticalPaint(() => {
    void renderDynamicWidget(nube);
  });
}

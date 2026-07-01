import type { NubeComponent, NubeSDK, NubeSDKState, ProductDetails, ProductVariant } from "@tiendanube/nube-sdk-types";

const BLOCK_ID = "compre-junto-nubesdk-onload-test";
const TARGET_SLOT = "after_product_detail_add_to_cart";
const FALLBACK_DELAY_MS = 1200;
const APP_ORIGIN = "https://compre-junto-nuvemshop-production.up.railway.app";
const PUBLIC_OFFERS_URL = `${APP_ORIGIN}/api/public/offers`;
const CART_ADD_TIMEOUT_MS = 8000;

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
  location?: Location;
  requestIdleCallback?: IdleCallback;
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
  storeId: string | null;
};

type PublicOfferResponse = {
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

let renderStarted = false;
let warningLogged = false;
let cartListenersRegistered = false;
let activeOffer: ActiveOffer | null = null;
let cartAddStatus: CartAddStatus = "idle";
let cartStatusMessage: string | null = null;
let cartAddTimeout: ReturnType<typeof setTimeout> | undefined;
let pendingCartItems: CartItemExpectation[] | null = null;

function getBrowserGlobals() {
  return globalThis as unknown as BrowserGlobals;
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
    }) ??
    variants[0] ??
    null
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

function readProductContext(nube: NubeSDK): ProductContext | null {
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
      storeId: state.store.id ? String(state.store.id) : null,
    };
  } catch {
    return null;
  }
}

function isPathProductDetailPage() {
  try {
    return getBrowserGlobals().location?.pathname.includes("/produtos/") === true;
  } catch {
    return false;
  }
}

function isSafeDiagnosticMode(nube?: NubeSDK) {
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
    const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";

    return hasDebugParam || isLocal;
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
    return renderStarted;
  }
}

function createDiagnosticBlock(reason: string): NubeComponent {
  return box({
    background: "#ffffff",
    borderRadius: "8px",
    direction: "col",
    gap: "6px",
    id: BLOCK_ID,
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

function getBundleCartItems(context: ProductContext, suggestedProduct: ProductCardData): BundleCartItemPayload[] | null {
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
    setCartStatus(nube, "success", "Conjunto adicionado ao carrinho.");
  });

  nube.on("cart:add:fail", () => {
    if (cartAddStatus !== "loading") {
      return;
    }

    clearCartAddTimeout();
    pendingCartItems = null;
    setCartStatus(nube, "error", "Nao foi possivel adicionar o conjunto. Use o link abaixo para continuar.");
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

function normalizeSuggestedProduct(context: ProductContext, response: PublicOfferResponse): ProductCardData | null {
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

async function fetchOffer(context: ProductContext): Promise<PublicOfferResponse> {
  const url = `${PUBLIC_OFFERS_URL}?productId=${context.mainProduct.productId}${
    context.storeId ? `&storeId=${context.storeId}` : ""
  }`;

  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    logWarningOnce("offer_lookup_failed", {
      status: response.status,
    });

    return { offer: null };
  }

  try {
    return (await response.json()) as PublicOfferResponse;
  } catch {
    logWarningOnce("offer_response_invalid");
    return { offer: null };
  }
}

function renderDiagnostic(nube: NubeSDK, reason: string) {
  if (!isSafeDiagnosticMode(nube)) {
    return;
  }

  nube.render(TARGET_SLOT, createDiagnosticBlock(reason));
}

async function renderDynamicWidget(nube: NubeSDK) {
  if (renderStarted || hasRenderedBlock(nube)) {
    return;
  }

  const context = readProductContext(nube);

  if (!context) {
    if (isPathProductDetailPage()) {
      renderDiagnostic(nube, "PDP detectado pela URL, mas o contexto de produto NubeSDK nao ficou disponivel.");
    }

    return;
  }

  renderStarted = true;

  try {
    const offerResponse = await fetchOffer(context);
    const suggestedProduct = normalizeSuggestedProduct(context, offerResponse);

    if (!suggestedProduct) {
      renderDiagnostic(nube, "Nenhuma oferta ativa encontrada para este produto.");
      return;
    }

    activeOffer = { context, suggestedProduct };
    cartAddStatus = "idle";
    cartStatusMessage = null;
    pendingCartItems = null;
    clearCartAddTimeout();
    registerCartListeners(nube);
    nube.render(TARGET_SLOT, createOfferBlock(nube, context, suggestedProduct));
  } catch {
    renderStarted = false;
    logWarningOnce("dynamic_render_failed");
    renderDiagnostic(nube, "Falha segura ao carregar a oferta dinamica.");
  }
}

function scheduleAfterCriticalPaint(render: () => void) {
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

  const run = () => {
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
  scheduleAfterCriticalPaint(() => {
    void renderDynamicWidget(nube);
  });
}

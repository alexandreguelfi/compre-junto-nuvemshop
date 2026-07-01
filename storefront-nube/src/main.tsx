import type { NubeComponent, NubeSDK } from "@tiendanube/nube-sdk-types";

const BLOCK_ID = "compre-junto-nubesdk-onload-test";
const TARGET_SLOT = "after_product_detail_add_to_cart";
const FALLBACK_DELAY_MS = 1200;
const DOM_FALLBACK_GRACE_MS = 250;

const PRODUCT_FORM_SELECTORS = [
  'form[action*="/cart"]',
  'form[action*="/carrinho"]',
  'form[action*="/comprar"]',
  'form[action*="/checkout"]',
  "form.js-product-form",
  "form.product-form",
  'form[data-store*="product"]',
  "form[data-product-id]",
  'form[id*="product"]',
  'form[class*="product"]',
] as const;

const BUY_BUTTON_SELECTORS = [
  'button[name="add_to_cart"]',
  'input[name="add_to_cart"]',
  'button[type="submit"]',
  'input[type="submit"]',
  '[data-store="product-buy-button"]',
  '[data-store="product-form-submit"]',
  ".js-addtocart",
  ".js-add-to-cart",
  ".add-to-cart",
  '[class*="add-to-cart"]',
  '[class*="comprar"]',
  '[class*="buy"]',
] as const;

const PRODUCT_CONTAINER_SELECTORS = [
  '[data-store="product-info"]',
  '[data-store="product-detail"]',
  '[data-product-id]',
  ".js-product-detail",
  ".product-detail",
  ".product-single",
  ".product",
  "main",
] as const;

type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleCallbackOptions = {
  timeout?: number;
};

type IdleCallback = (callback: (deadline: IdleDeadline) => void, options?: IdleCallbackOptions) => unknown;

type BrowserGlobals = typeof globalThis & {
  document?: Document;
  location?: Location;
  requestIdleCallback?: IdleCallback;
};

let slotRenderStarted = false;

function getBrowserGlobals() {
  return globalThis as unknown as BrowserGlobals;
}

function createOnloadDiagnosticBlock(): NubeComponent {
  return {
    type: "box",
    id: BLOCK_ID,
    __internalId: `${BLOCK_ID}-box`,
    background: "#ffffff",
    borderRadius: "8px",
    direction: "col",
    gap: "6px",
    padding: "14px",
    style: {
      borderColor: "#22c55e",
      borderStyle: "solid",
      borderWidth: "1px",
      margin: "14px 0",
    },
    children: [
      {
        type: "txt",
        __internalId: `${BLOCK_ID}-title`,
        heading: 2,
        style: {
          fontSize: "16px",
          fontWeight: 700,
          margin: 0,
        },
        children: "Compre Junto NubeSDK onload #841a480 ativado",
      },
      {
        type: "txt",
        __internalId: `${BLOCK_ID}-subtitle`,
        color: "#52525b",
        style: {
          fontSize: "13px",
          margin: 0,
        },
        children: "Render diagnóstico com fallback direto no PDP",
      },
    ],
  };
}

function createDomDiagnosticBlock(documentRef: Document) {
  const block = documentRef.createElement("div");
  block.id = BLOCK_ID;
  block.style.cssText = [
    "box-sizing:border-box",
    "background:#ffffff",
    "border:1px solid #22c55e",
    "border-radius:8px",
    "margin:14px 0",
    "padding:14px",
    "font-family:inherit",
    "color:#18181b",
  ].join(";");

  const title = documentRef.createElement("div");
  title.textContent = "Compre Junto NubeSDK onload #841a480 ativado";
  title.style.cssText = "font-size:16px;font-weight:700;line-height:1.3;margin:0 0 6px;";

  const subtitle = documentRef.createElement("div");
  subtitle.textContent = "Render diagnóstico com fallback direto no PDP";
  subtitle.style.cssText = "color:#52525b;font-size:13px;line-height:1.4;margin:0;";

  block.appendChild(title);
  block.appendChild(subtitle);

  return block;
}

function isSdkProductDetailPage(nube?: NubeSDK) {
  try {
    return nube?.getState().location.page.type === "product";
  } catch {
    return false;
  }
}

function isPathProductDetailPage() {
  try {
    return getBrowserGlobals().location?.pathname.includes("/produtos/") === true;
  } catch {
    return false;
  }
}

function isProductDetailPage(nube?: NubeSDK) {
  return isPathProductDetailPage() || isSdkProductDetailPage(nube);
}

function hasDomBlock() {
  try {
    return Boolean(getBrowserGlobals().document?.getElementById(BLOCK_ID));
  } catch {
    return false;
  }
}

function hasRenderedSlot(nube: NubeSDK) {
  try {
    const slot = nube.getState().ui.slots[TARGET_SLOT];
    const blocks = Array.isArray(slot) ? slot : slot ? [slot] : [];

    return blocks.some((block) => typeof block === "object" && block !== null && "id" in block && block.id === BLOCK_ID);
  } catch {
    return slotRenderStarted;
  }
}

function queryFirst(root: ParentNode, selectors: readonly string[]) {
  for (const selector of selectors) {
    try {
      const element = root.querySelector(selector);

      if (element) {
        return element;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function insertAfter(target: Element | null, block: HTMLElement) {
  try {
    const parent = target?.parentNode;

    if (!target || !parent) {
      return false;
    }

    parent.insertBefore(block, target.nextSibling);
    return true;
  } catch {
    return false;
  }
}

function appendInside(target: Element | null, block: HTMLElement) {
  try {
    target?.appendChild(block);
    return Boolean(target);
  } catch {
    return false;
  }
}

function renderDirectDomFallback(nube?: NubeSDK) {
  try {
    const documentRef = getBrowserGlobals().document;

    if (!documentRef?.body || !isProductDetailPage(nube) || hasDomBlock()) {
      return;
    }

    const productContainer = queryFirst(documentRef, PRODUCT_CONTAINER_SELECTORS);
    const scopedRoot = productContainer ?? documentRef;
    const block = createDomDiagnosticBlock(documentRef);
    const productForm = queryFirst(scopedRoot, PRODUCT_FORM_SELECTORS) ?? queryFirst(documentRef, PRODUCT_FORM_SELECTORS);

    if (insertAfter(productForm, block)) {
      return;
    }

    const buyButton = queryFirst(scopedRoot, BUY_BUTTON_SELECTORS) ?? queryFirst(documentRef, BUY_BUTTON_SELECTORS);

    if (insertAfter(buyButton, block)) {
      return;
    }

    if (appendInside(productContainer, block)) {
      return;
    }

    documentRef.body.appendChild(block);
  } catch {
    return;
  }
}

function scheduleDirectDomFallback(nube?: NubeSDK) {
  setTimeout(() => {
    renderDirectDomFallback(nube);
  }, DOM_FALLBACK_GRACE_MS);
}

function renderOnloadDiagnostic(nube: NubeSDK) {
  if (slotRenderStarted || !isProductDetailPage(nube) || hasDomBlock() || hasRenderedSlot(nube)) {
    return;
  }

  try {
    slotRenderStarted = true;
    nube.render(TARGET_SLOT, createOnloadDiagnosticBlock());
    scheduleDirectDomFallback(nube);
  } catch {
    slotRenderStarted = false;
    renderDirectDomFallback(nube);
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

function scheduleStandaloneDomFallback() {
  scheduleAfterCriticalPaint(() => {
    scheduleDirectDomFallback();
  });
}

scheduleStandaloneDomFallback();

export function App(nube: NubeSDK) {
  scheduleAfterCriticalPaint(() => {
    renderOnloadDiagnostic(nube);
  });
}

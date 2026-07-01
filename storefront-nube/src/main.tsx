import type { NubeComponent, NubeSDK } from "@tiendanube/nube-sdk-types";

const BLOCK_ID = "compre-junto-nubesdk-onload-test";
const TARGET_SLOT = "after_product_detail_add_to_cart";
const FALLBACK_DELAY_MS = 1200;

type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type IdleCallbackOptions = {
  timeout?: number;
};

type IdleCallback = (callback: (deadline: IdleDeadline) => void, options?: IdleCallbackOptions) => unknown;

let renderStarted = false;

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
        children: "Compre Junto NubeSDK onload otimizado ativo",
      },
      {
        type: "txt",
        __internalId: `${BLOCK_ID}-subtitle`,
        color: "#52525b",
        style: {
          fontSize: "13px",
          margin: 0,
        },
        children: "Render leve em 1 slot para teste de performance",
      },
    ],
  };
}

function isProductDetailPage(nube: NubeSDK) {
  try {
    return nube.getState().location.page.type === "product";
  } catch {
    return false;
  }
}

function hasRenderedBlock(nube: NubeSDK) {
  try {
    const slot = nube.getState().ui.slots[TARGET_SLOT];
    const blocks = Array.isArray(slot) ? slot : slot ? [slot] : [];

    return blocks.some((block) => typeof block === "object" && block !== null && "id" in block && block.id === BLOCK_ID);
  } catch {
    return renderStarted;
  }
}

function renderOnloadDiagnostic(nube: NubeSDK) {
  if (renderStarted || !isProductDetailPage(nube) || hasRenderedBlock(nube)) {
    return;
  }

  try {
    renderStarted = true;
    nube.render(TARGET_SLOT, createOnloadDiagnosticBlock());
  } catch {
    renderStarted = false;
  }
}

function scheduleAfterCriticalPaint(nube: NubeSDK) {
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

  const render = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
    }

    renderOnloadDiagnostic(nube);
  };

  fallbackTimer = setTimeout(render, FALLBACK_DELAY_MS);

  try {
    const requestIdleCallback = (globalThis as unknown as { requestIdleCallback?: IdleCallback }).requestIdleCallback;

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(render, { timeout: FALLBACK_DELAY_MS });
    }
  } catch {
    return;
  }
}

export function App(nube: NubeSDK) {
  scheduleAfterCriticalPaint(nube);
}

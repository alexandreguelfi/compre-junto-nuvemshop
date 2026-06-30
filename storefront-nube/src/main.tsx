import { STOREFRONT_UI_SLOT, type NubeSDK } from "@tiendanube/nube-sdk-types";

const PERF_SAFE_SLOT = STOREFRONT_UI_SLOT.AFTER_PRODUCT_DETAIL_ADD_TO_CART;
const ID_PREFIX = "compre-junto-perf-safe";

function createPerfSafeBlock() {
  return {
    type: "box",
    __internalId: `${ID_PREFIX}-box`,
    background: "#ffffff",
    borderRadius: "8px",
    direction: "col",
    gap: "6px",
    padding: "12px",
    style: {
      borderColor: "#22c55e",
      borderStyle: "solid",
      borderWidth: "1px",
      margin: "12px 0",
    },
    children: [
      {
        type: "txt",
        __internalId: `${ID_PREFIX}-title`,
        style: {
          fontSize: "15px",
          fontWeight: 700,
          margin: 0,
        },
        children: "Compre Junto NubeSDK perf-safe",
      },
      {
        type: "txt",
        __internalId: `${ID_PREFIX}-subtitle`,
        color: "#52525b",
        style: {
          fontSize: "13px",
          margin: 0,
        },
        children: "Render adiado e isolado para teste de desempenho",
      },
    ],
  };
}

function scheduleAfterCriticalPaint(callback: () => void) {
  const globalScope = globalThis as typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  };

  if (typeof globalScope.requestIdleCallback === "function") {
    globalScope.requestIdleCallback(callback, { timeout: 1800 });
    return;
  }

  setTimeout(callback, 1200);
}

export function App(nube: NubeSDK) {
  scheduleAfterCriticalPaint(() => {
    nube.render(PERF_SAFE_SLOT, createPerfSafeBlock() as never);
  });
}

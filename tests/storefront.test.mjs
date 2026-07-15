import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

import {
  claimRenderLock,
  getBundleCartItems,
  normalizeSuggestedProduct,
  readProductContext,
} from "../storefront-nube/src/main.ts";
import { widgetScript } from "../app/widget/compre-junto.js/route.ts";

function product(id, variantId = id * 10) {
  return {
    canonical_url: `/produtos/${id}/`,
    id,
    images: [],
    name: { pt: `Produto ${id}` },
    variants: [
      {
        id: variantId,
        price: "10.00",
        promotional_price: null,
        compare_at_price: null,
        stock: 2,
        stock_management: true,
      },
    ],
  };
}

function nubeWithState(state, initialLocks = {}) {
  const locks = new Map(Object.entries(initialLocks));
  const nube = {
    getState: () => state,
    getBrowserAPIs: () => ({
      asyncSessionStorage: {
        getItem: async (key) => locks.get(key) ?? null,
        setItem: async (key, value) => void locks.set(key, value),
      },
    }),
  };
  nube.locks = locks;
  return nube;
}

function productState(productId = 123, storeId = 7901767) {
  return {
    location: { page: { type: "product", data: { product: product(productId) } }, queries: {} },
    store: {
      id: storeId,
      language: "pt",
      currency: "BRL",
      currency_details: { code: "BRL", display_short: "R$" },
    },
  };
}

test("NubeSDK detects storeId and productId from official state", () => {
  const context = readProductContext(nubeWithState(productState()));
  assert.equal(context.storeId, "7901767");
  assert.equal(context.mainProduct.productId, "123");
  assert.equal(context.mainProduct.variantId, "1230");
});

test("NubeSDK never sends an unavailable main variant to the cart", () => {
  const state = productState();
  state.location.page.data.product.variants[0].stock = 0;
  const context = readProductContext(nubeWithState(state));
  assert.equal(context.mainProduct.variantId, null);
});

test("NubeSDK cart payload adds the exact principal and suggested variants", () => {
  const context = readProductContext(nubeWithState(productState()));
  const items = getBundleCartItems(context, {
    compareAtPrice: { amount: null, label: null },
    imageUrl: null,
    name: "Sugerido",
    price: { amount: 20, label: "R$ 20" },
    productId: "456",
    url: "/produtos/456/",
    variantId: "4560",
  });
  assert.deepEqual(items, [
    { product_id: 123, quantity: 1, variant_id: 1230 },
    { product_id: 456, quantity: 1, variant_id: 4560 },
  ]);
});

test("NubeSDK rejects an offer whose principal product does not match the page", () => {
  const context = readProductContext(nubeWithState(productState()));
  assert.equal(
    normalizeSuggestedProduct(context, {
      offer: { principalProductId: "999", suggestedProduct: { id: "456", name: "Sugerido" } },
    }),
    null,
  );
});

test("legacy and NubeSDK share a render lock and cannot duplicate the widget", async () => {
  const context = readProductContext(nubeWithState(productState()));
  const key = `compre-junto:render-lock:${context.storeId}:${context.mainProduct.productId}`;
  const nube = nubeWithState(productState(), {
    [key]: JSON.stringify({ renderedAt: Date.now(), technology: "legacy" }),
  });
  assert.equal(await claimRenderLock(nube, context), false);
});

test("NubeSDK does not persist a lock before rendering and ignores a stale page lease", async () => {
  const context = readProductContext(nubeWithState(productState()));
  const key = `compre-junto:render-lock:${context.storeId}:${context.mainProduct.productId}`;
  const staleLease = JSON.stringify({ renderedAt: Date.now() - 60_000, technology: "legacy" });
  const nube = nubeWithState(productState(), {
    [key]: staleLease,
  });
  assert.equal(await claimRenderLock(nube, context), true);
  assert.equal(nube.locks.get(key), staleLease);
});

test("render leases remain store/product scoped across A to B to A navigation", async () => {
  const stateA = productState(123, 7901767);
  const contextA = readProductContext(nubeWithState(stateA));
  const contextB = readProductContext(nubeWithState(productState(456, 7901767)));
  const keyA = `compre-junto:render-lock:${contextA.storeId}:${contextA.mainProduct.productId}`;
  const keyB = `compre-junto:render-lock:${contextB.storeId}:${contextB.mainProduct.productId}`;
  const nubeA = nubeWithState(stateA, {
    [keyA]: JSON.stringify({ renderedAt: Date.now(), technology: "nubesdk" }),
    [keyB]: JSON.stringify({ renderedAt: Date.now(), technology: "legacy" }),
  });
  assert.equal(await claimRenderLock(nubeA, contextA), true);
  assert.equal(await claimRenderLock(nubeA, contextB), false);
  assert.notEqual(keyA, keyB);
});

test("legacy script uses the official app origin when Nuvemshop serves it from apps-scripts", async () => {
  const urls = [];
  const beacons = [];
  const scriptAttributes = new Map();
  const script = {
    dataset: { productId: "352812666", storeId: "7895581" },
    getAttribute(name) {
      return name === "data-product-id"
        ? "352812666"
        : name === "data-store-id"
          ? "7895581"
          : scriptAttributes.get(name) ?? "";
    },
    setAttribute(name, value) { scriptAttributes.set(name, String(value)); },
    src: "https://apps-scripts.tiendanube.com/store/7895581/script/8403.js",
  };
  const timers = [];
  const storage = new Map();
  const makeElement = () => {
    const attributes = new Map();
    const element = {
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      children: [],
      getAttribute(name) { return attributes.get(name) ?? null; },
      remove() {},
      setAttribute(name, value) { attributes.set(name, String(value)); },
      style: {},
    };
    Object.defineProperty(element, "innerHTML", {
      set() { element.children = []; },
    });
    return element;
  };
  const container = makeElement();
  const window = {
    addEventListener() {},
    location: { href: "https://loja.example/produtos/x/", origin: "https://loja.example", search: "" },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  const document = {
    currentScript: script,
    documentElement: null,
    addEventListener() {},
    createElement: makeElement,
    getElementById(id) { return container.children.find((element) => element.id === id) ?? null; },
    getElementsByTagName() { return [script]; },
    querySelector(selector) { return selector === "[data-compre-junto-widget]" ? container : null; },
  };
  const context = {
    Blob,
    URL,
    URLSearchParams,
    console,
    document,
    fetch: async (url) => {
      urls.push(String(url));
      return {
        json: async () => ({
          offer: {
            principalProduct: { id: "352812666", name: "Principal", price: "10.00" },
            suggestedProduct: { id: "352812667", name: "Sugerido", path: "/produtos/sugerido/", price: "20.00" },
          },
        }),
      };
    },
    Intl,
    navigator: { sendBeacon: (url) => void beacons.push(String(url)) },
    clearInterval() {},
    setInterval: () => 1,
    setTimeout: (callback) => (timers.push(callback), timers.length),
    window,
  };
  window.window = window;
  vm.runInNewContext(widgetScript, context);
  assert.equal(urls.length, 0);
  assert.equal(script.getAttribute("data-compre-junto-bootstrap"), "legacy");
  document.currentScript = null;
  while (timers.length) timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/compre-junto-nuvemshop-production\.up\.railway\.app\/api\/public\/offers\?/);
  assert.match(urls[0], /productId=352812666/);
  assert.match(urls[0], /storeId=7895581/);
  assert.match(urls[0], /technology=legacy/);
  assert.deepEqual(beacons, ["https://compre-junto-nuvemshop-production.up.railway.app/api/public/storefront-events"]);
  assert.equal([...urls, ...beacons].some((url) => url.includes("apps-scripts.tiendanube.com/api/public/")), false);
  assert.notEqual(document.getElementById("compre-junto-widget-root"), null);
});

test("storefront scripts include safe error, timeout, cart and SPA handling", async () => {
  const nubeSource = await readFile(new URL("../storefront-nube/src/main.ts", import.meta.url), "utf8");
  assert.match(nubeSource, /CART_ADD_TIMEOUT_MS = 8000/);
  assert.match(nubeSource, /cart:add:fail/);
  assert.match(nubeSource, /location:updated/);
  assert.match(nubeSource, /clearSlot\(TARGET_SLOT\)/);
  assert.match(widgetScript, /\.catch\(function \(\) \{\}\)/);
  assert.match(widgetScript, /MutationObserver/);
  assert.doesNotMatch(widgetScript, /Tiendanube\.addToCart/);
  assert.match(widgetScript, /Ver produto recomendado/);
  assert.match(widgetScript, /recordRendered\(context\)/);
  assert.match(widgetScript, /var bootstrapScript = document\.currentScript/);
  assert.match(widgetScript, /https:\/\/compre-junto-nuvemshop-production\.up\.railway\.app/);
  assert.doesNotMatch(widgetScript, /getDataValue\(script, "apiOrigin"\) \|\| script\.src/);
  assert.doesNotMatch(widgetScript, /accessToken|client_secret|Authorization/);
});

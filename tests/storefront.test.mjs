import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

import {
  claimRenderLock,
  App,
  getBundleCartItems,
  normalizeSuggestedProduct,
  readProductContext,
} from "../storefront-nube/src/main.ts";
import { widgetScript } from "../app/widget/compre-junto.js/route.ts";
import {
  buildStorefrontOfferRequestKey,
  STOREFRONT_REQUEST_STATE_KEY,
} from "../src/lib/storefront/browser-request-state.ts";

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
    cart: { items: [] },
    location: { page: { type: "product", data: { product: product(productId) } }, queries: {} },
    store: {
      id: storeId,
      language: "pt",
      currency: "BRL",
      currency_details: { code: "BRL", display_short: "R$" },
    },
    ui: { slots: {} },
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
  const requests = [];
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
    fetch: async (url, init = {}) => {
      requests.push({ init, url: String(url) });
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
    navigator: {},
    clearInterval() {},
    setInterval: () => 1,
    setTimeout: (callback) => (timers.push(callback), timers.length),
    window,
  };
  window.window = window;
  vm.runInNewContext(widgetScript, context);
  assert.equal(requests.length, 0);
  assert.equal(script.getAttribute("data-compre-junto-bootstrap"), "legacy");
  document.currentScript = null;
  while (timers.length) timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  const offerRequests = requests.filter(({ url }) => url.includes("/api/public/offers"));
  const eventRequests = requests.filter(({ url }) => url.includes("/api/public/storefront-events"));
  assert.equal(offerRequests.length, 1);
  assert.match(offerRequests[0].url, /^https:\/\/compre-junto-nuvemshop-production\.up\.railway\.app\/api\/public\/offers\?/);
  assert.match(offerRequests[0].url, /productId=352812666/);
  assert.match(offerRequests[0].url, /storeId=7895581/);
  assert.match(offerRequests[0].url, /technology=legacy/);
  assert.equal(offerRequests[0].init.credentials, "omit");
  assert.equal(eventRequests.length, 1);
  assert.equal(eventRequests[0].init.credentials, "omit");
  assert.equal(requests.some(({ url }) => url.includes("apps-scripts.tiendanube.com/api/public/")), false);
  assert.notEqual(document.getElementById("compre-junto-widget-root"), null);
});

test("three concurrent legacy initializations and two bundle executions share one response and one widget", async () => {
  const listeners = new Map();
  const timers = [];
  const requestCalls = [];
  const responsePayload = {
    offer: {
      principalProduct: { id: "352812666", name: "Principal", price: "10.00" },
      suggestedProduct: { id: "352812610", name: "Sugerido", path: "/produtos/sugerido/", price: "20.00" },
    },
  };
  let releaseOffer;
  const offerResponse = new Promise((resolve) => { releaseOffer = resolve; });
  const script = {
    dataset: { productId: "352812666", storeId: "7895581" },
    getAttribute(name) { return name === "data-product-id" ? "352812666" : name === "data-store-id" ? "7895581" : ""; },
    setAttribute() {},
    src: "https://apps-scripts.tiendanube.com/compre-junto-pro/compre-junto-tema-legado/4.js",
  };
  const makeElement = () => {
    const attributes = new Map();
    const element = {
      appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
      children: [],
      getAttribute(name) { return attributes.get(name) ?? null; },
      remove() {
        if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      style: {},
    };
    Object.defineProperty(element, "innerHTML", { set() { element.children = []; } });
    return element;
  };
  const container = makeElement();
  const window = {
    addEventListener(name, callback) {
      const callbacks = listeners.get(name) ?? [];
      callbacks.push(callback);
      listeners.set(name, callbacks);
    },
    location: { href: "https://loja.example/produtos/x/", search: "" },
    sessionStorage: { getItem: () => null, setItem() {} },
  };
  const document = {
    currentScript: script,
    addEventListener() {},
    createElement: makeElement,
    getElementById(id) { return container.children.find((element) => element.id === id) ?? null; },
    getElementsByTagName() { return [script]; },
    querySelector(selector) { return selector === "[data-compre-junto-widget]" ? container : null; },
  };
  const context = {
    URL,
    URLSearchParams,
    document,
    fetch: async (url, init = {}) => {
      const value = String(url);
      requestCalls.push({ init, url: value });
      if (value.includes("/api/public/offers")) return offerResponse;
      return { ok: true, json: async () => ({ ok: true }) };
    },
    Intl,
    Map,
    navigator: {},
    clearInterval() {},
    setInterval: () => 1,
    setTimeout: (callback) => (timers.push(callback), timers.length),
    window,
  };
  window.window = window;

  vm.runInNewContext(widgetScript, context);
  vm.runInNewContext(widgetScript, context);
  for (const callback of listeners.get("page:loaded") ?? []) callback();
  while (timers.length) timers.shift()();

  assert.equal(requestCalls.filter(({ url }) => url.includes("/api/public/offers")).length, 1);
  releaseOffer({ ok: true, json: async () => responsePayload });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  const requestKey = buildStorefrontOfferRequestKey({
    diagnosticMode: false,
    productId: "352812666",
    storeId: "7895581",
    technology: "legacy",
  });
  assert.equal(window[STOREFRONT_REQUEST_STATE_KEY].entries.get(requestKey).response, responsePayload);
  assert.equal(window[STOREFRONT_REQUEST_STATE_KEY].inFlight.size, 0);
  assert.equal(container.children.filter((element) => element.id === "compre-junto-widget-root").length, 1);
});

test("legacy checks NubeSDK ownership before network and never creates a periodic retry", async () => {
  const urls = [];
  const timers = [];
  const listeners = new Map();
  let observerCount = 0;
  const key = "compre-junto:render-lock:7895581:352812666";
  const storage = new Map([[key, JSON.stringify({ renderedAt: Date.now(), technology: "nubesdk" })]]);
  const script = {
    dataset: { productId: "352812666", storeId: "7895581" },
    getAttribute(name) { return name === "data-product-id" ? "352812666" : name === "data-store-id" ? "7895581" : ""; },
    setAttribute() {},
    src: "https://apps-scripts.tiendanube.com/store/7895581/script/8403.js",
  };
  const window = {
    addEventListener(name, callback) {
      const callbacks = listeners.get(name) ?? [];
      callbacks.push(callback);
      listeners.set(name, callbacks);
    },
    location: { href: "https://loja.example/produtos/x/", origin: "https://loja.example", search: "" },
    sessionStorage: { getItem: (item) => storage.get(item) ?? null, setItem: (item, value) => storage.set(item, value) },
  };
  const document = {
    currentScript: script,
    addEventListener() {},
    getElementById() { return null; },
    getElementsByTagName() { return [script]; },
    querySelector() { return null; },
  };
  const context = {
    Blob,
    URL,
    URLSearchParams,
    document,
    fetch: async (url) => { urls.push(String(url)); return { json: async () => ({ offer: null }) }; },
    Intl,
    Map,
    MutationObserver: class { constructor() { observerCount += 1; } },
    navigator: {},
    clearInterval() {},
    setInterval: () => 1,
    setTimeout: (callback) => (timers.push(callback), timers.length),
    window,
  };
  window.window = window;

  vm.runInNewContext(widgetScript, context);
  document.currentScript = script;
  vm.runInNewContext(widgetScript, context);
  for (const name of ["page:loaded", "location:updated", "pageshow"]) {
    for (const callback of listeners.get(name) ?? []) callback();
  }
  while (timers.length) timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(urls.filter((url) => url.includes("/api/public/offers")).length, 0);
  assert.equal(urls.filter((url) => url.includes("/api/public/storefront-events")).length, 1);
  assert.equal(observerCount, 0);
  assert.equal(timers.length, 0);
});

test("multiple legacy instances and nearby events share one failed request without retry", async () => {
  const urls = [];
  const timers = [];
  const listeners = new Map();
  let now = Date.now();
  class ScenarioDate extends Date {}
  ScenarioDate.now = () => now;
  const script = {
    dataset: { productId: "901", storeId: "7895581" },
    getAttribute(name) { return name === "data-product-id" ? "901" : name === "data-store-id" ? "7895581" : ""; },
    setAttribute() {},
    src: "https://apps-scripts.tiendanube.com/store/7895581/script/8403.js",
  };
  const window = {
    addEventListener(name, callback) {
      const callbacks = listeners.get(name) ?? [];
      callbacks.push(callback);
      listeners.set(name, callbacks);
    },
    location: { href: "https://loja.example/produtos/901/", search: "" },
    sessionStorage: { getItem: () => null, setItem() {} },
  };
  const document = {
    currentScript: script,
    addEventListener() {},
    getElementById() { return null; },
    getElementsByTagName() { return [script]; },
    querySelector() { return null; },
  };
  const context = {
    Blob,
    Date: ScenarioDate,
    URL,
    URLSearchParams,
    document,
    fetch: async (url) => {
      if (String(url).includes("/api/public/offers")) urls.push(String(url));
      throw new Error("temporary failure");
    },
    Intl,
    Map,
    navigator: { sendBeacon() {} },
    clearInterval() {},
    setInterval: () => 1,
    setTimeout: (callback) => (timers.push(callback), timers.length),
    window,
  };
  window.window = window;

  vm.runInNewContext(widgetScript, context);
  vm.runInNewContext(widgetScript, context);
  for (const callback of listeners.get("page:loaded") ?? []) callback();
  while (timers.length) timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(urls.length, 1);
  assert.equal(timers.length, 0);

  for (const callback of listeners.get("pageshow") ?? []) callback();
  while (timers.length) timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(urls.length, 1);
  assert.equal(timers.length, 0);

  now += 10_001;
  for (const callback of listeners.get("pageshow") ?? []) callback();
  while (timers.length) timers.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(urls.length, 2);
  assert.equal(timers.length, 0);
});

test("NubeSDK deduplicates initial events, SPA navigation, A return and variant changes", async () => {
  const originalFetch = globalThis.fetch;
  const originalIdle = globalThis.requestIdleCallback;
  const offerUrls = [];
  const state = productState(700, 7895581);
  const handlers = new Map();
  const locks = new Map();
  const nube = {
    clearSlot(slot) { delete state.ui.slots[slot]; },
    getBrowserAPIs: () => ({ asyncSessionStorage: { getItem: async (key) => locks.get(key) ?? null, setItem: async (key, value) => void locks.set(key, value) } }),
    getState: () => state,
    on(name, callback) {
      const callbacks = handlers.get(name) ?? [];
      callbacks.push(callback);
      handlers.set(name, callbacks);
    },
    render(slot, block) { state.ui.slots[slot] = block; },
    send() {},
  };
  const flush = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  };

  delete globalThis[STOREFRONT_REQUEST_STATE_KEY];
  globalThis.requestIdleCallback = (callback) => callback({ didTimeout: false, timeRemaining: () => 10 });
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.includes("/api/public/offers")) {
      offerUrls.push(value);
      const productId = new URL(value).searchParams.get("productId");
      return {
        ok: true,
        json: async () => ({ offer: { principalProductId: productId, suggestedProduct: { id: "999", name: "Sugerido", price: "20.00", variantId: "9990" } } }),
      };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };

  try {
    App(nube);
    for (const callback of handlers.get("page:loaded") ?? []) callback(state);
    for (const callback of handlers.get("location:updated") ?? []) callback(state);
    await flush();
    assert.equal(offerUrls.length, 1);

    state.location.page.data.product = product(701);
    for (const callback of handlers.get("location:updated") ?? []) callback(state);
    await flush();
    assert.equal(offerUrls.length, 2);

    state.location.page.data.product = product(700);
    for (const callback of handlers.get("location:updated") ?? []) callback(state);
    await flush();
    assert.equal(offerUrls.length, 2);

    const variantState = { eventPayload: { id: 7001, price: "11.00", product_id: 700, stock: 1, stock_management: true } };
    for (const callback of handlers.get("product:variant_selected") ?? []) callback(variantState);
    await flush();
    assert.equal(offerUrls.length, 2);

    state.location.page = { type: "home", data: {} };
    for (const callback of handlers.get("location:updated") ?? []) callback(state);
    await flush();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalIdle) globalThis.requestIdleCallback = originalIdle;
    else delete globalThis.requestIdleCallback;
    delete globalThis[STOREFRONT_REQUEST_STATE_KEY];
  }
});

test("NubeSDK caches a temporary offer failure and performs no aggressive retry", async () => {
  const originalFetch = globalThis.fetch;
  const originalIdle = globalThis.requestIdleCallback;
  const originalDateNow = Date.now;
  let now = originalDateNow();
  const state = productState(800, 7895581);
  const handlers = new Map();
  const locks = new Map();
  let offerCalls = 0;
  const nube = {
    clearSlot(slot) { delete state.ui.slots[slot]; },
    getBrowserAPIs: () => ({ asyncSessionStorage: { getItem: async (key) => locks.get(key) ?? null, setItem: async (key, value) => void locks.set(key, value) } }),
    getState: () => state,
    on(name, callback) {
      const callbacks = handlers.get(name) ?? [];
      callbacks.push(callback);
      handlers.set(name, callbacks);
    },
    render(slot, block) { state.ui.slots[slot] = block; },
    send() {},
  };
  const flush = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  };

  delete globalThis[STOREFRONT_REQUEST_STATE_KEY];
  Date.now = () => now;
  globalThis.requestIdleCallback = (callback) => callback({ didTimeout: false, timeRemaining: () => 10 });
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/public/offers")) {
      offerCalls += 1;
      if (offerCalls === 1) throw new Error("temporary failure");
      return { ok: true, json: async () => ({ offer: null }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };

  try {
    App(nube);
    for (const callback of handlers.get("page:loaded") ?? []) callback(state);
    for (const callback of handlers.get("location:updated") ?? []) callback(state);
    await flush();
    assert.equal(offerCalls, 1);

    for (const callback of handlers.get("page:loaded") ?? []) callback(state);
    for (const callback of handlers.get("location:updated") ?? []) callback(state);
    await flush();
    assert.equal(offerCalls, 1);

    now += 10_001;
    for (const callback of handlers.get("page:loaded") ?? []) callback(state);
    await flush();
    assert.equal(offerCalls, 2);

    now += 10_001;
    for (const callback of handlers.get("location:updated") ?? []) callback(state);
    await flush();
    assert.equal(offerCalls, 2);

    now += 50_000;
    for (const callback of handlers.get("location:updated") ?? []) callback(state);
    await flush();
    assert.equal(offerCalls, 3);
  } finally {
    Date.now = originalDateNow;
    globalThis.fetch = originalFetch;
    if (originalIdle) globalThis.requestIdleCallback = originalIdle;
    else delete globalThis.requestIdleCallback;
    delete globalThis[STOREFRONT_REQUEST_STATE_KEY];
  }
});

test("storefront scripts include safe error, timeout, cart and SPA handling", async () => {
  const nubeSource = await readFile(new URL("../storefront-nube/src/main.ts", import.meta.url), "utf8");
  assert.match(nubeSource, /CART_ADD_TIMEOUT_MS = 8000/);
  assert.match(nubeSource, /cart:add:fail/);
  assert.match(nubeSource, /location:updated/);
  assert.match(nubeSource, /clearSlot\(TARGET_SLOT\)/);
  assert.match(widgetScript, /\.catch\(function \(\) \{\}\)/);
  assert.doesNotMatch(widgetScript, /MutationObserver/);
  assert.doesNotMatch(widgetScript, /setTimeout\(scheduleRefresh, LEASE_MAX_AGE_MS\)/);
  assert.match(widgetScript, /if \(isNubeOwner\(context\)\)[\s\S]*fetch\(buildOfferUrl/);
  assert.doesNotMatch(widgetScript, /Tiendanube\.addToCart/);
  assert.match(widgetScript, /Ver produto recomendado/);
  assert.match(widgetScript, /recordRendered\(context\)/);
  assert.match(widgetScript, /var bootstrapScript = document\.currentScript/);
  assert.match(widgetScript, /https:\/\/compre-junto-nuvemshop-production\.up\.railway\.app/);
  assert.doesNotMatch(widgetScript, /getDataValue\(script, "apiOrigin"\) \|\| script\.src/);
  assert.doesNotMatch(widgetScript, /accessToken|client_secret|Authorization/);
});

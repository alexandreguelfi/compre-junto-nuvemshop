import { STOREFRONT_REQUEST_STATE_KEY } from "../../../src/lib/storefront/browser-request-state.ts";

export const widgetScript = String.raw`
(function () {
  "use strict";

  var bootstrapScript = document.currentScript;
  if (bootstrapScript && typeof bootstrapScript.setAttribute === "function") {
    bootstrapScript.setAttribute("data-compre-junto-bootstrap", "legacy");
  }

  var ROOT_ID = "compre-junto-widget-root";
  var LOCK_PREFIX = "compre-junto:render-lock:";
  var APP_ORIGIN = "https://compre-junto-nuvemshop-production.up.railway.app";
  var LEASE_MAX_AGE_MS = 5000;
  var LEASE_HEARTBEAT_MS = 1500;
  var FALLBACK_DELAY_MS = 1500;
  // Shared across legacy script instances; valid responses live for one minute and failures for ten seconds.
  var REQUEST_TTL_MS = 60000;
  var FAILURE_TTL_MS = 10000;
  var REQUEST_STATE_KEY = "${STOREFRONT_REQUEST_STATE_KEY}";
  var technology = "legacy";
  var requestVersion = 0;
  var activeKey = "";
  var renderedKey = "";
  var scheduled = false;
  var renderLeaseTimer = null;

  function getRequestState() {
    if (!window[REQUEST_STATE_KEY]) {
      window[REQUEST_STATE_KEY] = { entries: new Map(), historyPatched: false, inFlight: new Map(), suppressions: new Map() };
    }
    if (!window[REQUEST_STATE_KEY].suppressions) window[REQUEST_STATE_KEY].suppressions = new Map();
    return window[REQUEST_STATE_KEY];
  }

  function cleanId(value) {
    if (typeof value === "number" && isFinite(value)) return String(value);
    if (typeof value === "string" && /^\d{1,30}$/.test(value.trim())) return value.trim();
    return "";
  }

  function readKnownId(source, keys) {
    var index;
    if (!source || typeof source !== "object") return cleanId(source);
    for (index = 0; index < keys.length; index += 1) {
      var value = cleanId(source[keys[index]]);
      if (value) return value;
    }
    return "";
  }

  function getCurrentScript() {
    if (bootstrapScript) return bootstrapScript;
    if (document.currentScript) return document.currentScript;
    var markedScript = document.querySelector('script[data-compre-junto-bootstrap="legacy"]');
    if (markedScript) return markedScript;
    var scripts = document.getElementsByTagName("script");
    for (var index = scripts.length - 1; index >= 0; index -= 1) {
      if ((scripts[index].src || "").indexOf("/widget/compre-junto.js") >= 0) return scripts[index];
    }
    return null;
  }

  function getDataValue(script, name) {
    if (!script) return "";
    if (script.dataset && script.dataset[name]) return script.dataset[name];
    return script.getAttribute("data-" + name.replace(/[A-Z]/g, "-$&").toLowerCase()) || "";
  }

  function readScriptQuery(script, key) {
    if (!script || !script.src) return "";
    try {
      return cleanId(new URL(script.src, window.location.href).searchParams.get(key));
    } catch (error) {
      return "";
    }
  }

  function getLs() {
    return window.LS && typeof window.LS === "object" ? window.LS : null;
  }

  function idFromDataStore(prefix) {
    var element = document.querySelector('[data-store^="' + prefix + '-"]');
    var value = element && element.getAttribute("data-store");
    return value ? cleanId(value.slice(prefix.length + 1)) : "";
  }

  function detectProductId(script) {
    var ls = getLs();
    var nuvemshop = window.Nuvemshop && typeof window.Nuvemshop === "object" ? window.Nuvemshop : null;
    var explicit = cleanId(getDataValue(script, "productId")) || readScriptQuery(script, "productId");
    if (explicit) return explicit;

    var official =
      (ls ? readKnownId(ls.product, ["id", "productId", "product_id", "id_product", "nuvemshopProductId"]) : "") ||
      (nuvemshop ? readKnownId(nuvemshop.product, ["id", "productId", "product_id"]) : "");
    if (official) return official;

    var element = document.querySelector("[data-product-id]");
    return cleanId(element && element.getAttribute("data-product-id")) || idFromDataStore("product-form") || idFromDataStore("product-name");
  }

  function detectStoreId(script) {
    var ls = getLs();
    var nuvemshop = window.Nuvemshop && typeof window.Nuvemshop === "object" ? window.Nuvemshop : null;
    return (
      cleanId(getDataValue(script, "storeId")) ||
      readScriptQuery(script, "store") ||
      readScriptQuery(script, "storeId") ||
      (ls ? readKnownId(ls.store, ["id", "storeId", "store_id", "id_store", "nuvemshopStoreId"]) : "") ||
      (nuvemshop ? readKnownId(nuvemshop.store, ["id", "storeId", "store_id"]) : "") ||
      (nuvemshop ? cleanId(nuvemshop.storeId) : "")
    );
  }

  function debugRequested() {
    try {
      var params = new URLSearchParams(window.location.search);
      return ["cj_debug", "compre_junto_debug", "nubesdk_debug"].some(function (key) {
        return params.get(key) === "1" || params.get(key) === "true";
      });
    } catch (error) {
      return false;
    }
  }

  function buildContext(script) {
    var productId = detectProductId(script);
    var storeId = detectStoreId(script);
    return { key: storeId + ":" + productId, productId: productId, storeId: storeId };
  }

  function getApiOrigin(script) {
    var override = getDataValue(script, "apiOrigin");
    if (!override) return APP_ORIGIN;
    try {
      var url = new URL(override);
      return url.protocol === "https:" ? url.origin : APP_ORIGIN;
    } catch (error) {
      return APP_ORIGIN;
    }
  }

  function buildOfferUrl(script, context) {
    var url = new URL("/api/public/offers", getApiOrigin(script));
    if (context.productId) url.searchParams.set("productId", context.productId);
    if (context.storeId) url.searchParams.set("storeId", context.storeId);
    url.searchParams.set("technology", technology);
    if (debugRequested()) url.searchParams.set("cj_debug", "1");
    return url;
  }

  function eventUrl(script) {
    return new URL("/api/public/storefront-events", getApiOrigin(script)).toString();
  }

  function report(script, context, code) {
    if (!context.productId || !context.storeId) return;
    var url = eventUrl(script);
    if (!url) return;
    var body = JSON.stringify({ code: code, productId: context.productId, storeId: context.storeId, technology: technology });
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
        credentials: "omit",
        keepalive: true
      }).catch(function () {});
    } catch (error) {}
  }

  function lockKey(context) {
    return LOCK_PREFIX + context.key;
  }

  function readLock(context) {
    try {
      return window.sessionStorage.getItem(lockKey(context));
    } catch (error) {
      return null;
    }
  }

  function claimRender(context) {
    var root = document.getElementById(ROOT_ID);
    if (root && root.getAttribute("data-compre-junto-key") === context.key) return false;
    var existing = readLock(context);
    if (!existing) return true;
    try {
      var lease = JSON.parse(existing);
      return !(
        lease.technology === "nubesdk" &&
        typeof lease.renderedAt === "number" &&
        Date.now() - lease.renderedAt >= 0 &&
        Date.now() - lease.renderedAt < LEASE_MAX_AGE_MS
      );
    } catch (error) {
      return !root;
    }
  }

  function isNubeOwner(context) {
    var root = document.getElementById(ROOT_ID);
    if (
      root &&
      root.getAttribute("data-compre-junto-technology") === "nubesdk" &&
      (!root.getAttribute("data-compre-junto-key") || root.getAttribute("data-compre-junto-key") === context.key)
    ) return true;
    var existing = readLock(context);
    if (!existing) return false;
    try {
      var lease = JSON.parse(existing);
      return (
        lease.technology === "nubesdk" &&
        typeof lease.renderedAt === "number" &&
        Date.now() - lease.renderedAt >= 0 &&
        Date.now() - lease.renderedAt < LEASE_MAX_AGE_MS
      );
    } catch (error) {
      return false;
    }
  }

  function reportNubeSuppression(script, context) {
    var state = getRequestState();
    var previous = state.suppressions.get(context.key) || 0;
    if (Date.now() - previous < REQUEST_TTL_MS) return;
    state.suppressions.set(context.key, Date.now());
    report(script, context, "legacy_suppressed_nubesdk");
  }

  function recordRendered(context) {
    try {
      window.sessionStorage.setItem(lockKey(context), JSON.stringify({ renderedAt: Date.now(), technology: technology }));
    } catch (error) {}
  }

  function stopRenderLeaseHeartbeat() {
    if (renderLeaseTimer) clearInterval(renderLeaseTimer);
    renderLeaseTimer = null;
  }

  function startRenderLeaseHeartbeat(context, root) {
    stopRenderLeaseHeartbeat();
    recordRendered(context);
    renderLeaseTimer = setInterval(function () {
      if (document.getElementById(ROOT_ID) === root && activeKey === context.key) recordRendered(context);
      else stopRenderLeaseHeartbeat();
    }, LEASE_HEARTBEAT_MS);
  }

  function insertAfter(target, element) {
    if (!target || !target.parentNode) return false;
    target.parentNode.insertBefore(element, target.nextSibling);
    return true;
  }

  function findContainer(script) {
    var explicit = document.querySelector("[data-compre-junto-widget]");
    if (explicit) return explicit;
    var container = document.createElement("div");
    container.setAttribute("data-compre-junto-container", "legacy");
    var anchor = document.querySelector(
      '[data-store="product-buy-button"], [data-component="product.add-to-cart"], [data-store^="product-form"], [data-store^="product-info"]'
    );
    if (insertAfter(anchor, container) || insertAfter(script, container)) return container;
    var main = document.querySelector("main, [role=main]");
    if (main) {
      main.appendChild(container);
      return container;
    }
    return null;
  }

  function formatPrice(product) {
    var value = product && (product.promotionalPrice || product.price);
    if (!value) return "Preco indisponivel";
    var amount = Number(String(value).replace(",", "."));
    if (!isFinite(amount)) return String(value);
    try {
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
    } catch (error) {
      return "R$ " + amount.toFixed(2).replace(".", ",");
    }
  }

  function makeProductLine(label, product) {
    var row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:10px;margin:8px 0";
    if (product.imageUrl) {
      var image = document.createElement("img");
      image.src = product.imageUrl;
      image.alt = product.name || label;
      image.width = 56;
      image.height = 56;
      image.style.cssText = "width:56px;height:56px;border-radius:6px;object-fit:cover";
      row.appendChild(image);
    }
    var copy = document.createElement("div");
    var caption = document.createElement("small");
    var name = document.createElement("strong");
    var price = document.createElement("span");
    caption.textContent = label;
    name.textContent = product.name || "Produto";
    price.textContent = formatPrice(product);
    caption.style.cssText = "display:block;color:#71717a";
    name.style.cssText = "display:block;font-size:14px";
    price.style.cssText = "display:block;font-size:13px;margin-top:2px";
    copy.appendChild(caption);
    copy.appendChild(name);
    copy.appendChild(price);
    row.appendChild(copy);
    return row;
  }

  function makeLink(product) {
    if (!product.url && !product.path) return null;
    var link = document.createElement("a");
    link.href = product.path || product.url;
    link.textContent = "Ver produto recomendado";
    link.style.cssText =
      "display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 14px;border:1px solid #18181b;border-radius:6px;color:#18181b;text-decoration:none;font-size:14px;font-weight:700";
    return link;
  }

  function renderOffer(script, context, offer) {
    var container = findContainer(script);
    if (!container) return;
    if (!claimRender(context)) {
      report(script, context, "widget_already_rendered");
      return;
    }

    var oldRoot = document.getElementById(ROOT_ID);
    if (oldRoot && oldRoot.getAttribute("data-compre-junto-technology") === technology) oldRoot.remove();

    var root = document.createElement("section");
    var title = document.createElement("h2");
    var plus = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-compre-junto-key", context.key);
    root.setAttribute("data-compre-junto-technology", technology);
    root.style.cssText =
      "box-sizing:border-box;margin:16px 0;padding:16px;border:1px solid #22c55e;border-radius:8px;background:#fff;color:#18181b;font-family:Arial,Helvetica,sans-serif;line-height:1.4";
    title.textContent = "Compre junto";
    title.style.cssText = "margin:0 0 8px;font-size:18px;font-weight:700";
    plus.textContent = "+";
    plus.style.cssText = "color:#22c55e;text-align:center;font-size:18px;font-weight:700";
    root.appendChild(title);
    root.appendChild(makeProductLine("Produto principal", offer.principalProduct || { id: context.productId, name: "Produto principal" }));
    root.appendChild(plus);
    root.appendChild(makeProductLine("Produto recomendado", offer.suggestedProduct));

    var link = makeLink(offer.suggestedProduct);
    if (link) root.appendChild(link);
    container.innerHTML = "";
    container.appendChild(root);
    if (document.getElementById(ROOT_ID) !== root) return;
    activeKey = context.key;
    renderedKey = context.key;
    startRenderLeaseHeartbeat(context, root);
    report(script, context, "widget_rendered");
  }

  function renderDiagnostic(payload) {
    if (!payload || !payload.diagnostic) return;
    var existing = document.querySelector("[data-compre-junto-diagnostic=legacy]");
    if (existing) existing.remove();
    var script = getCurrentScript();
    var container = findContainer(script);
    if (!container) return;
    var diagnostic = document.createElement("div");
    diagnostic.setAttribute("data-compre-junto-diagnostic", "legacy");
    diagnostic.style.cssText = "margin:12px 0;padding:10px;border:1px dashed #a1a1aa;font:13px Arial;color:#52525b";
    diagnostic.textContent =
      "Compre Junto: script carregado; produto " +
      (payload.diagnostic.productDetected ? "detectado" : "nao detectado") +
      "; loja " +
      (payload.diagnostic.storeDetected ? "detectada" : "nao detectada") +
      "; resultado " +
      payload.diagnostic.code +
      ".";
    container.appendChild(diagnostic);
  }

  function refresh() {
    scheduled = false;
    var script = getCurrentScript();
    if (!script) return;
    var context = buildContext(script);
    var currentRoot = document.getElementById(ROOT_ID);
    if (!context.productId) {
      if (currentRoot && currentRoot.getAttribute("data-compre-junto-technology") === technology) currentRoot.remove();
      stopRenderLeaseHeartbeat();
      activeKey = "";
      renderedKey = "";
      return;
    }
    if (isNubeOwner(context)) {
      reportNubeSuppression(script, context);
      return;
    }
    if (context.key === activeKey) {
      if (!renderedKey) return;
      if (
        currentRoot &&
        currentRoot.getAttribute("data-compre-junto-technology") === technology &&
        currentRoot.getAttribute("data-compre-junto-key") === context.key
      ) return;
      activeKey = "";
      renderedKey = "";
      stopRenderLeaseHeartbeat();
    }
    if (
      currentRoot &&
      currentRoot.getAttribute("data-compre-junto-technology") === technology &&
      currentRoot.getAttribute("data-compre-junto-key") !== context.key
    ) {
      currentRoot.remove();
      stopRenderLeaseHeartbeat();
      renderedKey = "";
    }

    var state = getRequestState();
    var requestKey = context.storeId + ":" + context.productId + ":" + technology + ":" +
      (debugRequested() ? "diagnostic" : "standard");
    var cached = state.entries.get(requestKey);
    var request;
    if (cached && cached.expiresAt > Date.now()) {
      report(script, context, "offer_request_deduplicated");
      request = Promise.resolve(cached.response);
    } else if (state.inFlight.has(requestKey)) {
      report(script, context, "offer_request_deduplicated");
      request = state.inFlight.get(requestKey);
    } else {
      if (cached) state.entries.delete(requestKey);
      request = fetch(buildOfferUrl(script, context), {
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "omit"
      })
        .then(function (response) {
          if (response.ok === false) return { failed: true, payload: null };
          return response.json()
            .then(function (payload) { return { failed: !payload, payload: payload }; })
            .catch(function () { return { failed: true, payload: null }; });
        })
        .catch(function () { return { failed: true, payload: null }; })
        .then(function (result) {
          state.entries.set(requestKey, {
            expiresAt: Date.now() + (result.failed ? FAILURE_TTL_MS : REQUEST_TTL_MS),
            response: result.payload
          });
          return result.payload;
        });
      // Registration is synchronous and precedes every asynchronous continuation above.
      state.inFlight.set(requestKey, request);
      var clearInFlight = function () {
        if (state.inFlight.get(requestKey) === request) state.inFlight.delete(requestKey);
      };
      request.then(clearInFlight, clearInFlight);
    }

    var version = ++requestVersion;
    request
      .then(function (payload) {
        if (version !== requestVersion || !payload) return;
        if (isNubeOwner(context)) {
          reportNubeSuppression(script, context);
          return;
        }
        if (!payload.offer) {
          activeKey = context.key;
          renderedKey = "";
          renderDiagnostic(payload);
          return;
        }
        renderOffer(script, context, payload.offer);
      });
  }

  function scheduleRefresh() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(refresh, FALLBACK_DELAY_MS);
  }

  function patchHistoryOnce() {
    var state = getRequestState();
    if (state.historyPatched || !window.history || typeof window.dispatchEvent !== "function") return;
    state.historyPatched = true;
    ["pushState", "replaceState"].forEach(function (method) {
      var original = window.history[method];
      if (typeof original !== "function") return;
      window.history[method] = function () {
        var result = original.apply(this, arguments);
        try { window.dispatchEvent(new Event("compre-junto:location-change")); } catch (error) {}
        return result;
      };
    });
  }

  patchHistoryOnce();
  window.addEventListener("popstate", scheduleRefresh);
  window.addEventListener("hashchange", scheduleRefresh);
  window.addEventListener("pageshow", scheduleRefresh);
  window.addEventListener("page:loaded", scheduleRefresh);
  window.addEventListener("location:updated", scheduleRefresh);
  window.addEventListener("compre-junto:location-change", scheduleRefresh);
  document.addEventListener("DOMContentLoaded", scheduleRefresh);
  scheduleRefresh();
})();
`;

export const dynamic = "force-static";
export const runtime = "nodejs";

export async function GET() {
  return new Response(widgetScript, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60, must-revalidate",
    },
  });
}
